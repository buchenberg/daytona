package toolbox

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/daytonaio/common-go/pkg/log"
	"github.com/daytonaio/common-go/pkg/telemetry"
	"github.com/daytonaio/daemon/internal"
)

// ResourceLabels are the optional daytona_* OpenTelemetry resource labels that
// are attached to sandbox telemetry when set. They are always supplied together,
// so they travel as one value rather than as separate parameters.
type ResourceLabels struct {
	OrganizationID *string
	RegionID       *string
	Snapshot       *string
}

// nonEmpty returns the label key/value pairs whose pointers are set and non-empty.
func (l ResourceLabels) nonEmpty() map[string]string {
	out := make(map[string]string)
	for _, p := range []struct {
		key string
		val *string
	}{
		{"daytona_organization_id", l.OrganizationID},
		{"daytona_region_id", l.RegionID},
		{"daytona_snapshot", l.Snapshot},
	} {
		if p.val != nil && *p.val != "" {
			out[p.key] = *p.val
		}
	}
	return out
}

func (s *server) initTelemetry(ctx context.Context, serviceName, entrypointLogFilePath string, labels ResourceLabels) error {
	if s.otelEndpoint == nil {
		s.logger.InfoContext(ctx, "Otel endpoint not provided, skipping telemetry initialization")
		return nil
	}

	if s.telemetry.LoggerProvider != nil {
		if err := s.telemetry.LoggerProvider.Shutdown(ctx); err != nil {
			return fmt.Errorf("failed to shutdown existing telemetry logger: %w", err)
		}
	}

	// Do NOT shut down the MeterProvider here: it keeps the metrics cache collecting until
	// InitMetrics produces a replacement (retired on success below), so a failed init can't orphan it.

	if s.telemetry.TracerProvider != nil {
		if err := s.telemetry.TracerProvider.Shutdown(ctx); err != nil {
			return fmt.Errorf("failed to shutdown existing telemetry tracer provider: %w", err)
		}
	}

	config := telemetry.Config{
		ServiceName:    serviceName,
		ServiceVersion: internal.Version,
		Endpoint:       *s.otelEndpoint,
		Headers: map[string]string{
			"sandbox-auth-token": s.authToken,
		},
		TLSConfig: telemetry.TLSConfigWithEmbeddedCerts(),
	}

	extraLabels := make(map[string]string)

	if envLabels := os.Getenv("DAYTONA_SANDBOX_OTEL_EXTRA_LABELS"); envLabels != "" {
		for pair := range strings.SplitSeq(envLabels, ",") {
			parts := strings.SplitN(pair, "=", 2)
			if len(parts) != 2 {
				s.logger.WarnContext(ctx, "Skipping malformed extra label", "label", pair)
				continue
			}
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			if key != "" {
				extraLabels[key] = value
			}
		}
	}

	for key, value := range labels.nonEmpty() {
		extraLabels[key] = value
	}

	if len(extraLabels) > 0 {
		config.ExtraLabels = extraLabels
	}

	// Use a background context
	telemetryContext := context.Background()

	// Initialize OpenTelemetry logging
	newLogger, lp, err := telemetry.InitLogger(telemetryContext, s.logger, config)
	if err != nil {
		return fmt.Errorf("failed to initialize logger: %w", err)
	}
	s.logger = newLogger

	if s.entrypointLogCancel != nil {
		s.entrypointLogCancel()
	}

	entrypointCtx, entrypointCancel := context.WithCancel(s.ctx)
	s.entrypointLogCancel = entrypointCancel

	go func() {
		if entrypointLogFilePath == "" {
			return
		}

		entrypointLogFile, err := os.Open(entrypointLogFilePath)
		if err != nil {
			s.logger.ErrorContext(ctx, "Failed to open entrypoint log file", "error", err, "daytona-entrypoint", true)
			return
		}
		defer entrypointLogFile.Close()

		errChan := make(chan error, 1)
		stdoutChan := make(chan []byte)
		stderrChan := make(chan []byte)
		go log.ReadMultiplexedLog(entrypointCtx, entrypointLogFile, true, stdoutChan, stderrChan, errChan)
		for {
			select {
			case <-entrypointCtx.Done():
				return
			case line := <-stdoutChan:
				s.logger.InfoContext(telemetryContext, string(line), "daytona-entrypoint", true)
			case line := <-stderrChan:
				s.logger.ErrorContext(telemetryContext, string(line), "daytona-entrypoint", true)
			case err := <-errChan:
				if err != nil {
					s.logger.ErrorContext(telemetryContext, "Error reading entrypoint log file", "error", err, "daytona-entrypoint", true)
				}
				return
			}
		}
	}()

	// Initialize OpenTelemetry metrics. Reuse the always-on store started at boot so the
	// /system/metrics endpoint and OTLP export share one collection; the CPU delta state in
	// the store survives this MeterProvider swap.
	if s.telemetry.SystemMetricsStore == nil {
		s.telemetry.SystemMetricsStore = telemetry.NewSystemMetricsStore()
	}
	mp, err := telemetry.InitMetrics(ctx, config, "daytona.sandbox", s.telemetry.SystemMetricsStore)
	if err != nil {
		if shutDownErr := lp.Shutdown(telemetryContext); shutDownErr != nil {
			s.logger.ErrorContext(ctx, "Failed to shutdown logger after metrics initialization failure", "shutdownErr", shutDownErr)
		}
		return fmt.Errorf("failed to initialize metrics: %w", err)
	}

	// Initialize OpenTelemetry tracing
	tp, err := telemetry.InitTracer(ctx, config)
	if err != nil {
		if shutDownErr := lp.Shutdown(telemetryContext); shutDownErr != nil {
			s.logger.ErrorContext(ctx, "Failed to shutdown logger after tracer initialization failure", "shutdownErr", shutDownErr)
		}
		if shutDownErr := mp.Shutdown(telemetryContext); shutDownErr != nil {
			s.logger.ErrorContext(ctx, "Failed to shutdown meter provider after tracer initialization failure", "shutdownErr", shutDownErr)
		}
		return fmt.Errorf("failed to initialize tracer: %w", err)
	}

	previousMeterProvider := s.telemetry.MeterProvider

	s.telemetry.TracerProvider = tp
	s.telemetry.MeterProvider = mp
	s.telemetry.LoggerProvider = lp

	if previousMeterProvider != nil {
		telemetry.ShutdownMeter(s.logger, previousMeterProvider)
	}

	s.logger.InfoContext(ctx, "Telemetry initialized successfully")
	return nil
}
