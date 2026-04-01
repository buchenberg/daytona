/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import Anthropic from '@anthropic-ai/sdk'
import { PosthogService } from './posthog.service'

export const posthogToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'query_posthog',
    description:
      'Execute a HogQL (SQL) query against PostHog analytics data. ' +
      'HogQL runs on ClickHouse — use ClickHouse SQL syntax. ' +
      'Core tables: events, persons, sessions, groups. ' +
      "Access event properties via properties.$name or properties['name']. " +
      'Access person properties via person.properties.$name. ' +
      'Always include a LIMIT clause (default 100, max 50000).',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'HogQL SQL query. Examples: ' +
            '"SELECT event, count() FROM events WHERE timestamp > now() - INTERVAL 1 DAY GROUP BY event ORDER BY count() DESC LIMIT 25", ' +
            '"SELECT properties.$current_url, count() FROM events WHERE event = \'$pageview\' GROUP BY 1 ORDER BY 2 DESC LIMIT 25"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_posthog_events',
    description:
      'List all event definitions in PostHog with 30-day volumes and last-seen timestamps. ' +
      'Call this first to discover what events are tracked before writing HogQL queries.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_posthog_properties',
    description:
      'List property definitions in PostHog, optionally filtered to a specific event. ' +
      'Use to discover available properties before querying.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_name: {
          type: 'string',
          description: "Optional event name to filter properties for (e.g. '$pageview', 'sandbox_created')",
        },
      },
      required: [],
    },
  },
]

export const posthogToolExecutors: Record<
  string,
  (service: PosthogService, input: Record<string, unknown>) => Promise<unknown>
> = {
  query_posthog: (service, input) => service.queryPosthog(input.query as string),
  list_posthog_events: (service) => service.listPosthogEvents(),
  list_posthog_properties: (service, input) => service.listPosthogProperties(input.event_name as string | undefined),
}
