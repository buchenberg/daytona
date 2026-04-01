/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import Anthropic from '@anthropic-ai/sdk'
import { ClickhouseService } from './clickhouse.service'

export const clickhouseToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'query_clickhouse',
    description:
      'Execute a ClickHouse SQL query against the billing/usage database. ' +
      'Use for billing analytics, spend calculations, usage trends, and ' +
      'time-series data suitable for graphing. The billing.usage_records ' +
      'table has ~107M rows of minute-level sandbox usage with price data. ' +
      'ClickHouse SQL syntax differs from PostgreSQL — see the schema notes. ' +
      'Only SELECT queries are allowed. Always include a time filter and LIMIT.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description:
            'ClickHouse SQL query. Use ClickHouse functions (toDate, subtractDays, etc.), not PostgreSQL syntax. Always filter by time range and add LIMIT.',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_clickhouse_tables',
    description: "List tables in a ClickHouse database. Defaults to 'billing'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        database: {
          type: 'string',
          description: 'Database name (default: billing). Available: billing, otel',
        },
      },
      required: [],
    },
  },
  {
    name: 'describe_clickhouse_table',
    description: 'Get column definitions for a ClickHouse table.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'Table name' },
        database: {
          type: 'string',
          description: 'Database name (default: billing)',
        },
      },
      required: ['table'],
    },
  },
]

function validateClickhouseSql(sql: string): string | null {
  if (/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(sql)) {
    return 'Only SELECT queries are allowed.'
  }
  const isAggregateOnly =
    /^\s*SELECT\s+(?:count|sum|avg|min|max|uniq)\s*\(/i.test(sql) && !/\bFROM\b.*\bFROM\b/is.test(sql)
  if (!isAggregateOnly && !/\bLIMIT\b/i.test(sql)) {
    return 'Query must include a LIMIT clause. Add LIMIT 25.'
  }
  return null
}

export const clickhouseToolExecutors: Record<
  string,
  (service: ClickhouseService, input: Record<string, unknown>) => Promise<unknown>
> = {
  query_clickhouse: (service, input) => {
    const sql = (input.sql as string).trim()
    const error = validateClickhouseSql(sql)
    if (error) return Promise.resolve({ error })
    return service.queryClickhouse(sql)
  },
  list_clickhouse_tables: (service, input) => service.listClickhouseTables((input.database as string) || 'billing'),
  describe_clickhouse_table: (service, input) =>
    service.describeClickhouseTable(input.table as string, (input.database as string) || 'billing'),
}
