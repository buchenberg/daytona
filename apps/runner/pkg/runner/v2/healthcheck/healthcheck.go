package healthcheck

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	apiclient "github.com/daytonaio/daytona/libs/api-client-go"
	"github.com/daytonaio/runner/internal"
	"github.com/daytonaio/runner/internal/metrics"
	runnerapiclient "github.com/daytonaio/runner/pkg/apiclient"
	"github.com/daytonaio/runner/pkg/docker"
)

const metricsCollectTimeout = 5 * time.Second

type HealthcheckServiceConfig struct {
	Interval   time.Duration
	Timeout    time.Duration
	Collector  *metrics.Collector
	Logger     *slog.Logger
	Domain     string
	ApiPort    int
	ProxyPort  int
	TlsEnabled bool
	Docker     *docker.DockerClient
}

// Service handles healthcheck reporting to the API
type Service struct {
	log        *slog.Logger
	interval   time.Duration
	timeout    time.Duration
	collector  *metrics.Collector
	client     *apiclient.APIClient
	domain     string
	apiPort    int
	proxyPort  int
	tlsEnabled bool
	docker     *docker.DockerClient
}

// NewService creates a new healthcheck service
func NewService(cfg *HealthcheckServiceConfig) (*Service, error) {
	apiClient, err := runnerapiclient.GetApiClient()
	if err != nil {
		return nil, fmt.Errorf("failed to create API client: %w", err)
	}

	if cfg.Docker == nil {
		return nil, fmt.Errorf("docker client is required for healthcheck service")
	}

	logger := slog.Default()
	if cfg.Logger != nil {
		logger = cfg.Logger
	}

	return &Service{
		log:        logger.With(slog.String("component", "healthcheck")),
		client:     apiClient,
		interval:   cfg.Interval,
		timeout:    cfg.Timeout,
		collector:  cfg.Collector,
		domain:     cfg.Domain,
		apiPort:    cfg.ApiPort,
		proxyPort:  cfg.ProxyPort,
		tlsEnabled: cfg.TlsEnabled,
		docker:     cfg.Docker,
	}, nil
}

// Start begins the healthcheck loop
func (s *Service) Start(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	// Send initial healthcheck immediately
	if err := s.sendHealthcheck(ctx); err != nil {
		s.log.WarnContext(ctx, "Failed to send initial healthcheck", "error", err)
	}

	for {
		select {
		case <-ctx.Done():
			s.log.InfoContext(ctx, "Healthcheck loop stopped")
			return
		case <-ticker.C:
			if err := s.sendHealthcheck(ctx); err != nil {
				s.log.WarnContext(ctx, "Failed to send healthcheck", "error", err)
				// Continue trying - don't crash
			}
		}
	}
}

// sendHealthcheck sends a healthcheck to the API
func (s *Service) sendHealthcheck(ctx context.Context) error {
	// Build healthcheck request
	healthcheck := apiclient.NewRunnerHealthcheck(internal.Version)
	healthcheck.SetDomain(s.domain)

	proxyUrl := fmt.Sprintf("http://%s:%d", s.domain, s.proxyPort)
	apiUrl := fmt.Sprintf("http://%s:%d", s.domain, s.apiPort)

	if s.tlsEnabled {
		apiUrl = fmt.Sprintf("https://%s:%d", s.domain, s.apiPort)
		proxyUrl = fmt.Sprintf("https://%s:%d", s.domain, s.proxyPort)
	}

	healthcheck.SetProxyUrl(proxyUrl)
	healthcheck.SetApiUrl(apiUrl)

	serviceProbes := s.docker.ServiceHealthProbes()

	serviceHealth := make([]apiclient.RunnerServiceHealth, 0, len(serviceProbes))
	for _, probe := range serviceProbes {
		health := apiclient.RunnerServiceHealth{ServiceName: probe.Name, Healthy: true}

		// Each probe gets its own timeout so a slow one can't starve the others.
		probeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err := probe.Ping(probeCtx)
		cancel()
		if err != nil {
			s.log.WarnContext(ctx, "Service health check failed", "service", probe.Name, "error", err)
			errStr := err.Error()
			health.Healthy = false
			health.ErrorReason = &errStr
		}
		serviceHealth = append(serviceHealth, health)
	}

	healthcheck.SetServiceHealth(serviceHealth)

	// Collect metrics
	metricsCtx, metricsCancel := context.WithTimeout(ctx, metricsCollectTimeout)
	m, err := s.collector.Collect(metricsCtx)
	metricsCancel()

	if err != nil {
		s.log.WarnContext(ctx, "Failed to collect metrics for healthcheck", "error", err)
	} else {
		metrics := apiclient.RunnerHealthMetrics{
			CurrentCpuLoadAverage:        m.CPULoadAverage,
			CurrentCpuUsagePercentage:    m.CPUUsagePercentage,
			CurrentMemoryUsagePercentage: m.MemoryUsagePercentage,
			CurrentDiskUsagePercentage:   m.DiskUsagePercentage,
			CurrentAllocatedCpu:          m.AllocatedCPU,
			CurrentAllocatedMemoryGiB:    m.AllocatedMemoryGiB,
			CurrentAllocatedDiskGiB:      m.AllocatedDiskGiB,
			CurrentSnapshotCount:         m.SnapshotCount,
			CurrentStartedSandboxes:      m.StartedSandboxCount,
			Cpu:                          m.TotalCPU,
			MemoryGiB:                    m.TotalRAMGiB,
			DiskGiB:                      m.TotalDiskGiB,
		}
		if c := s.docker.GpuCount(); c > 0 {
			metrics.SetGpu(float32(c))
			metrics.SetGpuType(s.docker.GpuType())
		}
		healthcheck.SetMetrics(metrics)
	}

	reqCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	req := s.client.RunnersAPI.RunnerHealthcheck(reqCtx).RunnerHealthcheck(*healthcheck)
	_, err = req.Execute()
	if err != nil {
		return err
	}

	s.log.DebugContext(reqCtx, "Healthcheck sent successfully")
	return nil
}
