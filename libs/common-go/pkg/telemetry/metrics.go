// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/host"
	otel_runtime "go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/metric"
	sdk_metric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
)

// InitMetrics initializes OpenTelemetry Metrics with an OTLP HTTP exporter, folding each
// collection into store for the local metrics endpoint. Also starts host + Go runtime
// instrumentation (OTLP-only). The export interval defaults to 60s and is overridable via
// OTEL_METRIC_EXPORT_INTERVAL (do not pass WithInterval, which would disable that override).
func InitMetrics(ctx context.Context, config Config, meterName string, store *SystemMetricsStore) (*sdk_metric.MeterProvider, error) {
	// Resource describing this service
	res, err := resource.New(ctx,
		resource.WithAttributes(config.Attributes()...),
	)
	if err != nil {
		return nil, err
	}

	// Create OTLP HTTP metrics exporter
	metricOpts := []otlpmetrichttp.Option{
		otlpmetrichttp.WithEndpointURL(config.Endpoint + "/v1/metrics"),
		otlpmetrichttp.WithHeaders(config.Headers),
	}
	if config.useTLSClient() {
		metricOpts = append(metricOpts, otlpmetrichttp.WithTLSClientConfig(config.TLSConfig))
	}
	exporter, err := otlpmetrichttp.New(ctx, metricOpts...)
	if err != nil {
		return nil, err
	}

	reader := sdk_metric.NewPeriodicReader(newAsyncExporter(exporter))

	// MeterProvider with resource and reader
	mp := sdk_metric.NewMeterProvider(
		sdk_metric.WithResource(res),
		sdk_metric.WithReader(reader),
	)

	// Set as global provider so otel.Meter(...) uses it
	otel.SetMeterProvider(mp)

	// Get container limits
	limits := getContainerLimits()
	slog.Info("Detected container limits",
		"cpu_cores", limits.CPULimit,
		"memory_bytes", limits.MemoryLimit,
		"memory_gb", float64(limits.MemoryLimit)/1073741824.0)

	// Log initial disk stats for verification
	if diskStats, err := getDiskStats("/"); err == nil {
		slog.Info("Detected filesystem",
			"total_gb", float64(diskStats.Total)/1073741824.0,
			"used_gb", float64(diskStats.Used)/1073741824.0,
			"available_gb", float64(diskStats.Available)/1073741824.0)
	}

	registerSandboxMetrics(meterName, mp, limits, store)

	// Start runtime metrics collection
	if err := otel_runtime.Start(otel_runtime.WithMinimumReadMemStatsInterval(time.Second)); err != nil {
		slog.Warn("Failed to start runtime metrics", "error", err)
	}

	// Start host metrics collection
	slog.Info("Starting host metrics collection")
	if err := host.Start(host.WithMeterProvider(mp)); err != nil {
		slog.Warn("Failed to start host metrics", "error", err)
	}

	return mp, nil
}

// ShutdownMeter gracefully shuts down the MeterProvider and flushes metrics.
func ShutdownMeter(logger *slog.Logger, mp *sdk_metric.MeterProvider) {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	if err := mp.Shutdown(ctx); err != nil {
		logger.Error("Error shutting down meter provider", "error", err)
	}
}

// InitSandboxMetricsCache starts sandbox resource-metrics collection into store WITHOUT an
// OTLP endpoint: a single PeriodicReader drives the observable callbacks (which refresh the
// store) via a no-op exporter, so the local /system/metrics endpoint has data even when
// telemetry export is not configured. It deliberately skips host/runtime instrumentation and
// the global provider (OTLP-only concerns). The export/sampling interval is overridable via
// OTEL_METRIC_EXPORT_INTERVAL. Non-blocking: the reader collects on its own goroutine.
func InitSandboxMetricsCache(meterName string, store *SystemMetricsStore) (*sdk_metric.MeterProvider, error) {
	reader := sdk_metric.NewPeriodicReader(noopMetricExporter{})
	mp := sdk_metric.NewMeterProvider(sdk_metric.WithReader(reader))
	registerSandboxMetrics(meterName, mp, getContainerLimits(), store)
	return mp, nil
}

// registerSandboxMetrics registers the sandbox limit/usage/disk observable gauges on mp with
// callbacks that fold each collection into store. Shared by InitMetrics (OTLP) and
// InitSandboxMetricsCache (no-op) so both transports observe a single collection.
func registerSandboxMetrics(meterName string, mp *sdk_metric.MeterProvider, limits *ResourceLimits, store *SystemMetricsStore) {
	if err := registerLimitsMetrics(meterName, mp, limits); err != nil {
		slog.Warn("Failed to register container limits metrics", "error", err)
	}
	if err := registerUsageMetrics(meterName, mp, limits, store); err != nil {
		slog.Warn("Failed to register container usage metrics", "error", err)
	}
	if err := registerDiskUsageMetrics(meterName, mp, store); err != nil {
		slog.Warn("Failed to register disk usage metrics", "error", err)
	}
}

type ResourceLimits struct {
	CPULimit    float64 // CPU cores
	MemoryLimit uint64  // bytes
	cgroupV2    bool
}

type DiskStats struct {
	Total     uint64 // Total bytes
	Used      uint64 // Used bytes
	Available uint64 // Available bytes
	Path      string // Mount path
}

// detectCgroupVersion detects if system is using cgroup v1 or v2
func detectCgroupVersion() bool {
	if _, err := os.Stat("/sys/fs/cgroup/cgroup.controllers"); err == nil {
		return true // cgroup v2
	}
	return false // cgroup v1
}

// getContainerLimits reads container resource limits from cgroups
func getContainerLimits() *ResourceLimits {
	limits := &ResourceLimits{
		cgroupV2: detectCgroupVersion(),
	}

	if limits.cgroupV2 {
		limits.readCgroupV2Limits()
	} else {
		limits.readCgroupV1Limits()
	}

	return limits
}

func (cl *ResourceLimits) readCgroupV1Limits() {
	// Read CPU limit from cgroup v1
	quota, _ := readInt64FromFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")
	period, _ := readInt64FromFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us")

	if quota > 0 && period > 0 {
		cl.CPULimit = float64(quota) / float64(period)
	} else {
		cl.CPULimit = float64(runtime.NumCPU())
	}

	// Read memory limit from cgroup v1
	if memLimit, err := readUint64FromFile("/sys/fs/cgroup/memory/memory.limit_in_bytes"); err == nil {
		// Check if limit is set to a reasonable value (not max uint64)
		if memLimit < 0x7FFFFFFFFFFFF000 {
			cl.MemoryLimit = memLimit
		}
	}
}

func (cl *ResourceLimits) readCgroupV2Limits() {
	// Read CPU limit from cgroup v2
	if data, err := os.ReadFile("/sys/fs/cgroup/cpu.max"); err == nil {
		parts := strings.Fields(strings.TrimSpace(string(data)))
		if len(parts) >= 2 && parts[0] != "max" {
			quota, _ := strconv.ParseInt(parts[0], 10, 64)
			period, _ := strconv.ParseInt(parts[1], 10, 64)
			if quota > 0 && period > 0 {
				cl.CPULimit = float64(quota) / float64(period)
			}
		}
	}

	if cl.CPULimit == 0 {
		cl.CPULimit = float64(runtime.NumCPU())
	}

	// Read memory limit from cgroup v2
	if memLimit, err := readUint64FromFile("/sys/fs/cgroup/memory.max"); err == nil {
		if memLimit < 0x7FFFFFFFFFFFF000 {
			cl.MemoryLimit = memLimit
		}
	}
}

func readInt64FromFile(filepath string) (int64, error) {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(strings.TrimSpace(string(data)), 10, 64)
}

func readUint64FromFile(filepath string) (uint64, error) {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return 0, err
	}
	return strconv.ParseUint(strings.TrimSpace(string(data)), 10, 64)
}

func getDiskStats(path string) (*DiskStats, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return nil, err
	}

	total := stat.Blocks * uint64(stat.Bsize)
	available := stat.Bavail * uint64(stat.Bsize)
	used := total - (stat.Bfree * uint64(stat.Bsize))

	return &DiskStats{
		Total:     total,
		Used:      used,
		Available: available,
		Path:      path,
	}, nil
}

// readCgroupMemUsageBytes reads current memory usage in bytes from the cgroup
// (v2 memory.current / v1 memory.usage_in_bytes).
func readCgroupMemUsageBytes(cgroupV2 bool) (uint64, error) {
	if cgroupV2 {
		return readUint64FromFile("/sys/fs/cgroup/memory.current")
	}
	return readUint64FromFile("/sys/fs/cgroup/memory/memory.usage_in_bytes")
}

// readCgroupMemCacheBytes reads the page-cache size in bytes from the cgroup
// (v2 memory.stat "file" / v1 memory.stat "cache").
func readCgroupMemCacheBytes(cgroupV2 bool) (uint64, error) {
	var statPath, key string
	if cgroupV2 {
		statPath = "/sys/fs/cgroup/memory.stat"
		key = "file"
	} else {
		statPath = "/sys/fs/cgroup/memory/memory.stat"
		key = "cache"
	}
	data, err := os.ReadFile(statPath)
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, key+" ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				return strconv.ParseUint(parts[1], 10, 64)
			}
		}
	}
	return 0, fmt.Errorf("%s not found in %s", key, statPath)
}

// readCgroupCPUUsageNanos reads cumulative CPU usage in nanoseconds from the
// cgroup (v2 cpu.stat usage_usec*1000 / v1 cpuacct.usage).
func readCgroupCPUUsageNanos(cgroupV2 bool) (uint64, error) {
	if !cgroupV2 {
		return readUint64FromFile("/sys/fs/cgroup/cpu/cpuacct.usage")
	}

	data, err := os.ReadFile("/sys/fs/cgroup/cpu.stat")
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "usage_usec") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				usec, err := strconv.ParseUint(parts[1], 10, 64)
				if err != nil {
					return 0, err
				}
				return usec * 1000, nil // microseconds → nanoseconds
			}
		}
	}
	return 0, fmt.Errorf("usage_usec not found in cpu.stat")
}

// cpuUsagePercent converts a cgroup CPU-time delta (nanoseconds) over a wall-clock
// window (nanoseconds) into a percentage of the container's CPU limit, so a fully
// busy N-core container with an N-core limit reads ~100%. Callers must guard
// against wallDeltaNanos <= 0 and cpuLimit <= 0.
func cpuUsagePercent(cpuDeltaNanos uint64, wallDeltaNanos int64, cpuLimit float64) float64 {
	return (float64(cpuDeltaNanos) / float64(wallDeltaNanos)) / cpuLimit * 100.0
}

// registerLimitsMetrics registers gauges for resource limits
func registerLimitsMetrics(name string, mp *sdk_metric.MeterProvider, limits *ResourceLimits) error {
	meter := mp.Meter(fmt.Sprintf("%s-limits", name))

	// CPU Limit gauge
	cpuLimitGauge, err := meter.Float64ObservableGauge(
		fmt.Sprintf("%s.cpu.limit", name),
		metric.WithDescription("CPU limit in cores"),
		metric.WithUnit("cores"),
	)
	if err != nil {
		return err
	}

	// Memory Limit gauge
	memoryLimitGauge, err := meter.Int64ObservableGauge(
		fmt.Sprintf("%s.memory.limit", name),
		metric.WithDescription("Memory limit in bytes"),
		metric.WithUnit("bytes"),
	)
	if err != nil {
		return err
	}

	// Register callback to observe the limits
	_, err = meter.RegisterCallback(
		func(ctx context.Context, observer metric.Observer) error {
			if limits.CPULimit > 0 {
				observer.ObserveFloat64(cpuLimitGauge, limits.CPULimit)
			}
			if limits.MemoryLimit > 0 {
				observer.ObserveInt64(memoryLimitGauge, int64(limits.MemoryLimit))
			}
			return nil
		},
		cpuLimitGauge,
		memoryLimitGauge,
	)

	return err
}

// registerUsageMetrics registers gauges for resource usage
func registerUsageMetrics(name string, mp *sdk_metric.MeterProvider, limits *ResourceLimits, store *SystemMetricsStore) error {
	meter := mp.Meter(fmt.Sprintf("%s-usage", name))

	// CPU Usage Percentage (relative to container limit)
	cpuUtilGauge, err := meter.Float64ObservableGauge(
		fmt.Sprintf("%s.cpu.utilization", name),
		metric.WithDescription("CPU utilization as percentage of limit"),
		metric.WithUnit("percent"),
	)
	if err != nil {
		return err
	}

	// Memory Usage Percentage (relative to container limit)
	memUtilGauge, err := meter.Float64ObservableGauge(
		fmt.Sprintf("%s.memory.utilization", name),
		metric.WithDescription("Memory utilization as percentage of limit"),
		metric.WithUnit("percent"),
	)
	if err != nil {
		return err
	}

	// Memory Usage (absolute)
	memUsageGauge, err := meter.Int64ObservableGauge(
		fmt.Sprintf("%s.memory.usage", name),
		metric.WithDescription("Memory usage in bytes"),
		metric.WithUnit("bytes"),
	)
	if err != nil {
		return err
	}

	// Memory Cache (page cache, absolute)
	memCacheGauge, err := meter.Int64ObservableGauge(
		fmt.Sprintf("%s.memory.cache", name),
		metric.WithDescription("Memory page cache in bytes"),
		metric.WithUnit("bytes"),
	)
	if err != nil {
		return err
	}

	_, err = meter.RegisterCallback(
		func(ctx context.Context, observer metric.Observer) error {
			memUsage, _ := readCgroupMemUsageBytes(limits.cgroupV2)
			memCache, _ := readCgroupMemCacheBytes(limits.cgroupV2)
			cpuUsage, _ := readCgroupCPUUsageNanos(limits.cgroupV2)

			cpuPct, cpuValid, memPct := store.recordUsage(cpuUsage, memUsage, memCache, time.Now(), limits)

			if memUsage > 0 {
				observer.ObserveInt64(memUsageGauge, int64(memUsage))
				if limits.MemoryLimit > 0 {
					observer.ObserveFloat64(memUtilGauge, memPct)
				}
			}
			if memCache > 0 {
				observer.ObserveInt64(memCacheGauge, int64(memCache))
			}
			// Skip the cold-start reading (no prior sample) so we don't emit a spurious 0%.
			if cpuValid {
				observer.ObserveFloat64(cpuUtilGauge, cpuPct)
			}

			return nil
		},
		cpuUtilGauge,
		memUtilGauge,
		memUsageGauge,
		memCacheGauge,
	)

	return err
}

// registerDiskUsageMetrics registers gauges for filesystem/disk usage metrics
func registerDiskUsageMetrics(name string, mp *sdk_metric.MeterProvider, store *SystemMetricsStore) error {
	meter := mp.Meter(fmt.Sprintf("%s-disk", name))

	// Disk usage in bytes
	diskUsageGauge, err := meter.Int64ObservableGauge(
		fmt.Sprintf("%s.filesystem.usage", name),
		metric.WithDescription("Filesystem usage in bytes"),
		metric.WithUnit("bytes"),
	)
	if err != nil {
		return err
	}

	// Disk total size in bytes
	diskTotalGauge, err := meter.Int64ObservableGauge(
		fmt.Sprintf("%s.filesystem.total", name),
		metric.WithDescription("Total filesystem size in bytes"),
		metric.WithUnit("bytes"),
	)
	if err != nil {
		return err
	}

	// Disk available in bytes
	diskAvailableGauge, err := meter.Int64ObservableGauge(
		fmt.Sprintf("%s.filesystem.available", name),
		metric.WithDescription("Available filesystem space in bytes"),
		metric.WithUnit("bytes"),
	)
	if err != nil {
		return err
	}

	// Disk utilization percentage
	diskUtilGauge, err := meter.Float64ObservableGauge(
		fmt.Sprintf("%s.filesystem.utilization", name),
		metric.WithDescription("Filesystem utilization as percentage"),
		metric.WithUnit("percent"),
	)
	if err != nil {
		return err
	}

	// Register callback to collect disk metrics
	_, err = meter.RegisterCallback(
		func(ctx context.Context, observer metric.Observer) error {
			// Get disk stats for root filesystem
			diskStats, err := getDiskStats("/")
			if err != nil {
				slog.Warn("Failed to get disk stats", "error", err)
				return nil // Don't fail the entire callback
			}

			store.recordDisk(diskStats.Used, diskStats.Total, diskStats.Available)

			// Create attributes for the filesystem
			attrs := metric.WithAttributes(
				attribute.String("device", diskStats.Path),
			)

			// Observe metrics
			observer.ObserveInt64(diskUsageGauge, int64(diskStats.Used), attrs)
			observer.ObserveInt64(diskTotalGauge, int64(diskStats.Total), attrs)
			observer.ObserveInt64(diskAvailableGauge, int64(diskStats.Available), attrs)

			// Calculate utilization percentage
			if diskStats.Total > 0 {
				utilizationPercent := float64(diskStats.Used) / float64(diskStats.Total) * 100.0
				observer.ObserveFloat64(diskUtilGauge, utilizationPercent, attrs)
			}

			return nil
		},
		diskUsageGauge,
		diskTotalGauge,
		diskAvailableGauge,
		diskUtilGauge,
	)

	return err
}
