// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"context"
	"math"
	"sync"
	"time"

	sdk_metric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

// SystemMetricsSnapshot is the most recent sandbox resource sample. Byte fields are
// in bytes; CPUUsedPct is a percentage of the CPU limit over the last sample window.
type SystemMetricsSnapshot struct {
	Sampled    bool
	CPUCount   int
	CPUUsedPct float64
	MemUsed    int64
	MemCache   int64
	MemTotal   int64
	DiskUsed   int64
	DiskTotal  int64
	DiskFree   int64
}

// SystemMetricsStore caches the latest sandbox resource sample. The OTEL observable
// callbacks fold each collection into it, so the sampling cadence is driven by the
// metric export reader (default 60s, overridable via OTEL_METRIC_EXPORT_INTERVAL).
// Readers such as the /system/metrics HTTP handler call Snapshot for the latest values.
type SystemMetricsStore struct {
	mu       sync.RWMutex
	snap     SystemMetricsSnapshot
	lastCPU  uint64
	lastTime time.Time
}

func NewSystemMetricsStore() *SystemMetricsStore {
	return &SystemMetricsStore{}
}

// Snapshot returns the most recently collected sample.
func (s *SystemMetricsStore) Snapshot() SystemMetricsSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.snap
}

// recordUsage folds a fresh cumulative CPU reading plus memory readings into the cache,
// computing CPU% as a delta over the previous sample window. Returns CPU%, whether that
// CPU% is from a real delta (false on the cold-start reading, so callers can skip emitting
// a spurious 0), and memory utilization%. The CPU delta state lives here (not in the
// callback closure) so it survives the MeterProvider being swapped when an OTLP endpoint
// arrives.
func (s *SystemMetricsStore) recordUsage(cpuUsage, memUsage, memCache uint64, now time.Time, limits *ResourceLimits) (cpuPct float64, cpuValid bool, memPct float64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.lastTime.IsZero() && limits.CPULimit > 0 {
		wallDelta := now.Sub(s.lastTime).Nanoseconds()
		if cpuUsage >= s.lastCPU && wallDelta > 0 {
			s.snap.CPUUsedPct = cpuUsagePercent(cpuUsage-s.lastCPU, wallDelta, limits.CPULimit)
			cpuValid = true
		} else {
			// Counter reset (cgroup recreated) or non-monotonic clock: the prior delta
			// is meaningless, so stop reporting the stale value.
			s.snap.CPUUsedPct = 0
		}
	}
	s.lastCPU = cpuUsage
	s.lastTime = now

	s.snap.CPUCount = int(math.Ceil(limits.CPULimit))
	s.snap.MemUsed = int64(memUsage)
	s.snap.MemCache = int64(memCache)
	s.snap.MemTotal = int64(limits.MemoryLimit)
	s.snap.Sampled = true

	if limits.MemoryLimit > 0 {
		memPct = float64(memUsage) / float64(limits.MemoryLimit) * 100.0
	}
	return s.snap.CPUUsedPct, cpuValid, memPct
}

// recordDisk folds fresh disk readings into the cache.
func (s *SystemMetricsStore) recordDisk(used, total, available uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.snap.DiskUsed = int64(used)
	s.snap.DiskTotal = int64(total)
	s.snap.DiskFree = int64(available)
}

// noopMetricExporter drives PeriodicReader collection (so the observable callbacks run
// and refresh the cache) without exporting anywhere. Used when no OTLP endpoint is
// configured so sandbox resource metrics are still collected for the local endpoint.
type noopMetricExporter struct{}

func (noopMetricExporter) Temporality(k sdk_metric.InstrumentKind) metricdata.Temporality {
	return sdk_metric.DefaultTemporalitySelector(k)
}

func (noopMetricExporter) Aggregation(k sdk_metric.InstrumentKind) sdk_metric.Aggregation {
	return sdk_metric.DefaultAggregationSelector(k)
}

func (noopMetricExporter) Export(context.Context, *metricdata.ResourceMetrics) error { return nil }
func (noopMetricExporter) ForceFlush(context.Context) error                          { return nil }
func (noopMetricExporter) Shutdown(context.Context) error                            { return nil }
