/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import Anthropic from '@anthropic-ai/sdk'
import { OpensearchService } from './opensearch.service'

export const opensearchToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'list_opensearch_indices',
    description:
      'List all non-system OpenSearch indices with document counts and sizes. ' +
      'Call this first to discover available audit-log indices.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_opensearch_index_mapping',
    description:
      'Get the field mapping (schema) for an OpenSearch index. ' +
      'Use this to discover field names and types before writing queries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        index: {
          type: 'string',
          description: "Index name or pattern (e.g. 'audit-logs-*')",
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'query_opensearch',
    description:
      'Execute an OpenSearch Query DSL search against an index. ' +
      "The 'query' parameter must be a JSON string containing the full " +
      'request body (query, aggs, sort, _source, etc.). ' +
      'Use for searching audit logs, aggregating events, and investigating ' +
      "user activity. Always include a 'size' or use aggregations to avoid " +
      'pulling too many results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        index: {
          type: 'string',
          description: "Index name or pattern (e.g. 'audit-logs-*')",
        },
        query: {
          type: 'string',
          description:
            'OpenSearch Query DSL as a JSON string. Example: ' +
            '{"query": {"bool": {"must": [{"match": {"action": "sandbox.create"}}]}}, ' +
            '"size": 25, "sort": [{"@timestamp": "desc"}]}',
        },
        size: {
          type: 'integer',
          description: "Max documents to return (default 100, max 500). Ignored if 'size' is set in the query body.",
        },
      },
      required: ['index', 'query'],
    },
  },
]

export const opensearchToolExecutors: Record<
  string,
  (service: OpensearchService, input: Record<string, unknown>) => Promise<unknown>
> = {
  list_opensearch_indices: (service) => service.listOpensearchIndices(),
  get_opensearch_index_mapping: (service, input) => service.getOpensearchIndexMapping(input.index as string),
  query_opensearch: (service, input) =>
    service.queryOpensearch(input.index as string, input.query as string, (input.size as number) || 100),
}
