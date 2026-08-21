package exporter

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"

	apiclient "github.com/daytonaio/daytona/libs/api-client-go"
	"github.com/daytonaio/otel-collector/exporter/internal/config"
	"go.opentelemetry.io/collector/client"
	"go.opentelemetry.io/collector/consumer/consumererror"
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
	"go.uber.org/zap"
	"google.golang.org/grpc/metadata"
)

// organizationIdAttributeKey is the resource attribute that sandboxes report their
// organization ID under (set by the daemon telemetry initialization).
const organizationIdAttributeKey = "daytona_organization_id"

type IExporter[T any] interface {
	push(context.Context, T) error
	exportViaHTTP(context.Context, T, *apiclient.OtelConfig) error
	extractSandboxToken(context.Context) (string, error)
	getBody(T) ([]byte, error)
	shutdown(context.Context) error
}

type Exporter[T any] struct {
	config   *Config
	resolver *config.Resolver
	logger   *zap.Logger
	route    string

	httpClients    map[string]*http.Client //lint:ignore U1000 Used in private methods consumed by the built collector
	mu             sync.RWMutex            //lint:ignore U1000 Used in private methods consumed by the built collector
	_getBody       func(T) ([]byte, error)
	_overrideOrgId func(T, string)
}

type exporterConfig struct {
	config   *Config
	logger   *zap.Logger
	resolver *config.Resolver
}

func newMetricExporter(cfg exporterConfig) IExporter[pmetric.Metrics] {
	return &Exporter[pmetric.Metrics]{
		config:   cfg.config,
		resolver: cfg.resolver,
		logger:   cfg.logger,
		route:    "v1/metrics",
		_getBody: func(md pmetric.Metrics) ([]byte, error) {
			req := pmetricotlp.NewExportRequestFromMetrics(md)
			return req.MarshalProto()
		},
		_overrideOrgId: func(md pmetric.Metrics, organizationId string) {
			resourceMetrics := md.ResourceMetrics()
			for i := 0; i < resourceMetrics.Len(); i++ {
				overrideOrganizationIdAttribute(resourceMetrics.At(i).Resource().Attributes(), organizationId)
			}
		},
	}
}

func newLogsExporter(cfg exporterConfig) IExporter[plog.Logs] {
	return &Exporter[plog.Logs]{
		config:   cfg.config,
		resolver: cfg.resolver,
		logger:   cfg.logger,
		route:    "v1/logs",
		_getBody: func(ld plog.Logs) ([]byte, error) {
			req := plogotlp.NewExportRequestFromLogs(ld)
			return req.MarshalProto()
		},
		_overrideOrgId: func(ld plog.Logs, organizationId string) {
			resourceLogs := ld.ResourceLogs()
			for i := 0; i < resourceLogs.Len(); i++ {
				overrideOrganizationIdAttribute(resourceLogs.At(i).Resource().Attributes(), organizationId)
			}
		},
	}
}

func newTracesExporter(cfg exporterConfig) IExporter[ptrace.Traces] {
	return &Exporter[ptrace.Traces]{
		config:   cfg.config,
		resolver: cfg.resolver,
		logger:   cfg.logger,
		route:    "v1/traces",
		_getBody: func(td ptrace.Traces) ([]byte, error) {
			req := ptraceotlp.NewExportRequestFromTraces(td)
			return req.MarshalProto()
		},
		_overrideOrgId: func(td ptrace.Traces, organizationId string) {
			resourceSpans := td.ResourceSpans()
			for i := 0; i < resourceSpans.Len(); i++ {
				overrideOrganizationIdAttribute(resourceSpans.At(i).Resource().Attributes(), organizationId)
			}
		},
	}
}

//lint:ignore U1000 Used by the built collector
func (e *Exporter[T]) push(ctx context.Context, data T) error {
	sandboxToken, sandboxErr := e.extractSandboxToken(ctx)
	if sandboxErr == nil {
		endpointConfig, err := e.resolver.GetOrganizationOtelConfig(ctx, sandboxToken)
		if err != nil {
			return fmt.Errorf("failed to get endpoint config for sandbox %w", err)
		}

		if endpointConfig == nil {
			e.logger.Debug("No endpoint configuration found for sandbox token, dropping data")
			return nil
		}

		e.overrideOrganizationId(data, endpointConfig)

		e.logger.Debug("Exporting data via sandbox token",
			zap.String("endpoint", endpointConfig.Endpoint),
		)
		return e.exportViaHTTP(ctx, data, endpointConfig)
	}

	orgId, orgErr := e.extractOrganizationId(ctx)
	if orgErr != nil {
		return consumererror.NewPermanent(fmt.Errorf("no sandbox token or organization ID in metadata: sandbox=%v, org=%v", sandboxErr, orgErr))
	}

	endpointConfig, err := e.resolver.GetOrganizationOtelConfigByOrgId(ctx, orgId)
	if err != nil {
		return fmt.Errorf("failed to get endpoint config for organization %s: %w", orgId, err)
	}

	if endpointConfig == nil {
		e.logger.Debug("No endpoint configuration found for organization, dropping data",
			zap.String("organizationId", orgId),
		)
		return nil
	}

	e.overrideOrganizationId(data, endpointConfig)

	e.logger.Debug("Exporting data via organization ID",
		zap.String("organizationId", orgId),
		zap.String("endpoint", endpointConfig.Endpoint),
	)
	return e.exportViaHTTP(ctx, data, endpointConfig)
}

// overrideOrganizationId rewrites the organization ID resource attribute on the data so it
// matches the organization the config was resolved for. Sandboxes created in the warm pool
// initialize telemetry with the warm pool organization ID baked into their resource
// attributes, which stays stale after the sandbox is assigned to a real organization.
//
//lint:ignore U1000 Used in private methods consumed by the built collector
func (e *Exporter[T]) overrideOrganizationId(data T, cfg *apiclient.OtelConfig) {
	if e._overrideOrgId == nil || cfg.OrganizationId == nil || *cfg.OrganizationId == "" {
		return
	}
	e._overrideOrgId(data, *cfg.OrganizationId)
}

// overrideOrganizationIdAttribute replaces the organization ID resource attribute if it is
// present with a different value. Attributes without the label are left untouched.
func overrideOrganizationIdAttribute(attributes pcommon.Map, organizationId string) {
	if value, ok := attributes.Get(organizationIdAttributeKey); ok && value.Str() != organizationId {
		attributes.PutStr(organizationIdAttributeKey, organizationId)
	}
}

//lint:ignore U1000 Used by the built collector
func (e *Exporter[T]) getBody(data T) ([]byte, error) {
	return e._getBody(data)
}

//lint:ignore U1000 Used by the built collector
func (e *Exporter[T]) exportViaHTTP(ctx context.Context, data T, cfg *apiclient.OtelConfig) error {
	httpClient := e.getOrCreateHTTPClient(cfg)

	// Create OTLP request and marshal to protobuf
	body, err := e.getBody(data)
	if err != nil {
		return fmt.Errorf("failed to marshal logs: %w", err)
	}

	// Create HTTP request
	endpoint := cfg.Endpoint
	if endpoint[len(endpoint)-1] != '/' {
		endpoint += "/"
	}
	endpoint += e.route

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/x-protobuf")
	for k, v := range cfg.Headers {
		httpReq.Header.Set(k, v)
	}

	// Send request
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

func (e *Exporter[T]) getOrCreateHTTPClient(cfg *apiclient.OtelConfig) *http.Client {
	e.mu.RLock()
	if e.httpClients == nil {
		e.mu.RUnlock()
		e.mu.Lock()
		e.httpClients = make(map[string]*http.Client)
		e.mu.Unlock()
		e.mu.RLock()
	}

	client, exists := e.httpClients[cfg.Endpoint]
	e.mu.RUnlock()

	if exists {
		return client
	}

	// Create new HTTP client
	e.mu.Lock()
	defer e.mu.Unlock()

	// Double-check after acquiring write lock
	if client, exists := e.httpClients[cfg.Endpoint]; exists {
		return client
	}

	client = &http.Client{
		Transport: http.DefaultTransport,
	}

	e.httpClients[cfg.Endpoint] = client

	return client
}

func (e *Exporter[T]) extractSandboxToken(ctx context.Context) (string, error) {
	clientInfo := client.FromContext(ctx)
	if token := clientInfo.Metadata.Get(e.config.SandboxAuthTokenHeader); len(token) > 0 {
		return token[0], nil
	}

	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if tokens := md.Get(e.config.SandboxAuthTokenHeader); len(tokens) > 0 {
			return tokens[0], nil
		}
	}

	return "", fmt.Errorf("sandbox token header '%s' not found in metadata", e.config.SandboxAuthTokenHeader)
}

func (e *Exporter[T]) extractOrganizationId(ctx context.Context) (string, error) {
	clientInfo := client.FromContext(ctx)
	if ids := clientInfo.Metadata.Get(e.config.OrganizationIdHeader); len(ids) > 0 {
		return ids[0], nil
	}

	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if ids := md.Get(e.config.OrganizationIdHeader); len(ids) > 0 {
			return ids[0], nil
		}
	}

	return "", fmt.Errorf("organization ID header '%s' not found in metadata", e.config.OrganizationIdHeader)
}

//lint:ignore U1000 Used by the built collector
func (e *Exporter[T]) shutdown(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.httpClients == nil {
		return nil
	}

	for _, client := range e.httpClients {
		// Close idle connections
		if transport, ok := client.Transport.(*http.Transport); ok {
			transport.CloseIdleConnections()
		}
	}

	e.httpClients = nil

	return nil
}
