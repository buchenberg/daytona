/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { GrafanaService } from './grafana.service'

export const grafanaToolDefinitions = [
  {
    name: 'list_datasources',
    description:
      'List all datasources configured in Grafana. Returns names, types ' +
      '(prometheus, loki, tempo, thanos …), UIDs, and numeric IDs. ' +
      "Call this first if you don't know the available datasources.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_datasource_by_name',
    description: 'Get detailed information about a Grafana datasource by its exact name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Exact datasource name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'query_prometheus',
    description:
      'Execute an **instant** PromQL query against a Prometheus or Thanos ' +
      'datasource. Returns the current value of the expression.',
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        query: {
          type: 'string',
          description: "PromQL expression, e.g. 'up', 'rate(http_requests_total[5m])'",
        },
        time: {
          type: 'string',
          description:
            "Optional evaluation timestamp (Unix epoch, RFC-3339, or relative like 'now', 'now-1h'). Defaults to now.",
        },
      },
      required: ['datasource_uid', 'query'],
    },
  },
  {
    name: 'query_prometheus_range',
    description:
      'Execute a **range** PromQL query. Returns time-series datapoints over ' +
      'a period. Use for trend / historical analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        query: { type: 'string', description: 'PromQL expression' },
        start: {
          type: 'string',
          description: "Start time (e.g. 'now-1h', '2025-01-01T00:00:00Z', Unix epoch)",
        },
        end: { type: 'string', description: "End time (e.g. 'now')" },
        step: {
          type: 'string',
          description: "Resolution step (e.g. '15s', '1m', '5m')",
        },
      },
      required: ['datasource_uid', 'query', 'start', 'end', 'step'],
    },
  },
  {
    name: 'list_prometheus_label_names',
    description: 'List all label names in a Prometheus/Thanos datasource.',
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
      },
      required: ['datasource_uid'],
    },
  },
  {
    name: 'get_prometheus_label_values',
    description: "Get all values for a label. Use label '__name__' to list metric names.",
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        label_name: {
          type: 'string',
          description: "Label name (e.g. 'job', 'instance', '__name__')",
        },
      },
      required: ['datasource_uid', 'label_name'],
    },
  },
  {
    name: 'get_prometheus_metric_metadata',
    description: "Get metric metadata (type, HELP, unit) from Prometheus. Omit 'metric' to list all.",
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        metric: {
          type: 'string',
          description: 'Optional specific metric name',
        },
      },
      required: ['datasource_uid'],
    },
  },
  {
    name: 'query_loki',
    description:
      'Execute a LogQL query against Loki. Returns log lines or metric results. ' +
      'Defaults to last 1 hour if start/end are omitted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        query: {
          type: 'string',
          description: 'LogQL expression, e.g. \'{job="app"} |= "error"\'',
        },
        start: { type: 'string', description: 'Optional start time (default: now-1h)' },
        end: { type: 'string', description: 'Optional end time (default: now)' },
        limit: {
          type: 'integer',
          description: 'Max log entries (default 100, max 5000)',
        },
        direction: {
          type: 'string',
          enum: ['forward', 'backward'],
          description: "'backward' = newest first (default), 'forward' = oldest first",
        },
      },
      required: ['datasource_uid', 'query'],
    },
  },
  {
    name: 'list_loki_label_names',
    description: 'List all label names in a Loki datasource.',
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
      },
      required: ['datasource_uid'],
    },
  },
  {
    name: 'get_loki_label_values',
    description: "Get all values for a label in Loki (e.g. 'namespace', 'container').",
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        label_name: { type: 'string', description: 'Label name' },
      },
      required: ['datasource_uid', 'label_name'],
    },
  },
  {
    name: 'search_tempo_traces',
    description:
      'Search for distributed traces in Tempo. Supports TraceQL queries or ' + 'simple tag/duration filters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        q: {
          type: 'string',
          description: 'Optional TraceQL query (e.g. \'{resource.service.name="app"}\')',
        },
        tags: {
          type: 'string',
          description: 'Optional space-separated key=value tag filters',
        },
        min_duration: { type: 'string', description: "e.g. '100ms', '1s'" },
        max_duration: { type: 'string', description: "e.g. '5s'" },
        limit: { type: 'integer', description: 'Max traces (default 20)' },
        start: { type: 'string', description: 'Optional start time' },
        end: { type: 'string', description: 'Optional end time' },
      },
      required: ['datasource_uid'],
    },
  },
  {
    name: 'get_tempo_trace',
    description: 'Retrieve a specific trace by ID from Tempo. Returns all spans.',
    input_schema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'Datasource UID' },
        trace_id: { type: 'string', description: 'Trace ID (hex string)' },
      },
      required: ['datasource_uid', 'trace_id'],
    },
  },
  {
    name: 'search_dashboards',
    description: 'Search Grafana dashboards by name or tag.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search string' },
        tag: { type: 'string', description: 'Filter by tag' },
      },
      required: [],
    },
  },
  {
    name: 'get_dashboard',
    description: 'Get full dashboard details (panels, queries, variables).',
    input_schema: {
      type: 'object' as const,
      properties: {
        uid: { type: 'string', description: 'Dashboard UID' },
      },
      required: ['uid'],
    },
  },
  {
    name: 'get_alert_rules',
    description: 'Get all configured alert rules organised by folder/group.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_firing_alerts',
    description: 'Get currently firing / active alerts from Grafana Alertmanager.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]

export const grafanaToolExecutors: Record<
  string,
  (service: GrafanaService, input: Record<string, unknown>) => Promise<unknown>
> = {
  list_datasources: (service) => service.listDatasources(),

  get_datasource_by_name: (service, input) => service.getDatasourceByName(input.name as string),

  query_prometheus: (service, input) =>
    service.queryPrometheus(input.datasource_uid as string, input.query as string, input.time as string | undefined),

  query_prometheus_range: (service, input) =>
    service.queryPrometheusRange(
      input.datasource_uid as string,
      input.query as string,
      input.start as string,
      input.end as string,
      input.step as string,
    ),

  list_prometheus_label_names: (service, input) => service.listPrometheusLabelNames(input.datasource_uid as string),

  get_prometheus_label_values: (service, input) =>
    service.getPrometheusLabelValues(input.datasource_uid as string, input.label_name as string),

  get_prometheus_metric_metadata: (service, input) =>
    service.getPrometheusMetricMetadata(input.datasource_uid as string, input.metric as string | undefined),

  query_loki: (service, input) =>
    service.queryLoki(
      input.datasource_uid as string,
      input.query as string,
      input.start as string | undefined,
      input.end as string | undefined,
      input.limit as number | undefined,
      input.direction as string | undefined,
    ),

  list_loki_label_names: (service, input) => service.listLokiLabelNames(input.datasource_uid as string),

  get_loki_label_values: (service, input) =>
    service.getLokiLabelValues(input.datasource_uid as string, input.label_name as string),

  search_tempo_traces: (service, input) =>
    service.searchTempoTraces(
      input.datasource_uid as string,
      input.q as string | undefined,
      input.tags as string | undefined,
      input.min_duration as string | undefined,
      input.max_duration as string | undefined,
      input.limit as number | undefined,
      input.start as string | undefined,
      input.end as string | undefined,
    ),

  get_tempo_trace: (service, input) => service.getTempoTrace(input.datasource_uid as string, input.trace_id as string),

  search_dashboards: (service, input) =>
    service.searchDashboards(input.query as string | undefined, input.tag as string | undefined),

  get_dashboard: (service, input) => service.getDashboard(input.uid as string),

  get_alert_rules: (service) => service.getAlertRules(),

  get_firing_alerts: (service) => service.getFiringAlerts(),
}
