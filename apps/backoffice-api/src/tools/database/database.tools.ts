import Anthropic from '@anthropic-ai/sdk'
import { DatabaseService } from './database.service'
import { ToolExecutor } from '../tool-registry'

export const databaseToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'query_database',
    description:
      'Execute a read-only SQL query against the production database. ' +
      'IMPORTANT: Always include LIMIT 25 unless the user explicitly asks ' +
      'for more. Use for investigating application data, configuration, ' +
      'and state. Only SELECT queries are allowed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description:
            'SQL SELECT query. ALWAYS include a LIMIT clause (default LIMIT 25) unless the user asked for all results.',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_database_tables',
    description:
      'List all tables in the production database. Call this first if you ' + "don't know what tables exist.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'describe_database_table',
    description: 'Get column definitions (name, type, nullable, default) for a database table.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table_name: {
          type: 'string',
          description: 'The exact table name to describe',
        },
      },
      required: ['table_name'],
    },
  },
]

function validateSql(sql: string): string | null {
  if (/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(sql)) {
    return 'Only SELECT queries are allowed.'
  }
  const isAggregateOnly = /^\s*SELECT\s+(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql) && !/\bFROM\b.*\bFROM\b/is.test(sql)
  if (!isAggregateOnly && !/\bLIMIT\b/i.test(sql)) {
    return 'Query must include a LIMIT clause. Add LIMIT 25 (or up to 50).'
  }
  return null
}

export const databaseToolExecutors: Record<string, ToolExecutor<DatabaseService>> = {
  query_database: (service, input, userId) => {
    const sql = (input.sql as string).trim()
    const error = validateSql(sql)
    if (error) return Promise.resolve({ error })
    return service.queryDatabase(sql, userId)
  },
  list_database_tables: (service, _input, userId) => service.listDatabaseTables(userId),
  describe_database_table: (service, input, userId) =>
    service.describeDatabaseTable(input.table_name as string, userId),
}
