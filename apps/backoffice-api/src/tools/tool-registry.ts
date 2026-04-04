/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { GrafanaService } from './grafana/grafana.service'
import { grafanaToolDefinitions, grafanaToolExecutors } from './grafana/grafana.tools'
import { DatabaseService } from './database/database.service'
import { databaseToolDefinitions, databaseToolExecutors } from './database/database.tools'
import { ClickhouseService } from './clickhouse/clickhouse.service'
import { clickhouseToolDefinitions, clickhouseToolExecutors } from './clickhouse/clickhouse.tools'
import { OpensearchService } from './opensearch/opensearch.service'
import { opensearchToolDefinitions, opensearchToolExecutors } from './opensearch/opensearch.tools'
import { PosthogService } from './posthog/posthog.service'
import { posthogToolDefinitions, posthogToolExecutors } from './posthog/posthog.tools'
import { SandboxService } from './sandbox/sandbox.service'
import { sandboxToolDefinitions, sandboxToolExecutors } from './sandbox/sandbox.tools'
import { truncateResult, safeSummary } from './truncate'

const SANDBOX_TOOL_NAMES = new Set([
  'sandbox_create',
  'sandbox_list',
  'sandbox_get',
  'sandbox_delete',
  'sandbox_exec',
  'create_fix_pr',
])

/** Tools that mutate state — must execute sequentially, never in parallel. */
const SIDE_EFFECT_TOOL_NAMES = new Set(['sandbox_create', 'sandbox_delete', 'sandbox_exec', 'create_fix_pr'])

/** Per-tool timeout overrides (ms). Default: 30s. */
const TOOL_TIMEOUTS: Record<string, number> = {
  query_prometheus_range: 45_000,
  query_loki: 45_000,
  query_clickhouse: 45_000,
  query_opensearch: 45_000,
  query_posthog: 45_000,
  search_tempo_traces: 45_000,
  sandbox_create: 120_000,
  sandbox_exec: 60_000,
  create_fix_pr: 300_000,
}

const DEFAULT_TIMEOUT_MS = 30_000

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name)
  private readonly tools: Anthropic.Tool[] = []
  private readonly executors = new Map<string, (input: Record<string, unknown>, userId?: string) => Promise<string>>()

  constructor(
    private readonly grafana: GrafanaService,
    private readonly database: DatabaseService,
    private readonly clickhouse: ClickhouseService,
    private readonly opensearch: OpensearchService,
    private readonly posthog: PosthogService,
    private readonly sandbox: SandboxService,
  ) {
    this.registerCategory('Grafana', this.grafana, grafanaToolDefinitions, grafanaToolExecutors)
    this.registerCategory('Database', this.database, databaseToolDefinitions, databaseToolExecutors)
    this.registerCategory('ClickHouse', this.clickhouse, clickhouseToolDefinitions, clickhouseToolExecutors)
    this.registerCategory('OpenSearch', this.opensearch, opensearchToolDefinitions, opensearchToolExecutors)
    this.registerCategory('PostHog', this.posthog, posthogToolDefinitions, posthogToolExecutors)
    this.registerSandboxTools()

    this.logger.log(`Tool registry initialized with ${this.tools.length} tools`)
  }

  private registerCategory(
    name: string,
    service: { isConfigured(): boolean },
    definitions: readonly Anthropic.Tool[],
    executors: Record<string, (service: any, input: Record<string, unknown>) => Promise<unknown>>,
  ) {
    if (!service.isConfigured()) {
      this.logger.warn(`${name} tools skipped — not configured`)
      return
    }
    this.logger.log(`${name} tools enabled (${definitions.length} tools)`)
    for (const def of definitions) {
      this.tools.push(def)
      const executor = executors[def.name]
      if (executor) {
        this.executors.set(def.name, async (input) => {
          const result = await executor(service, input)
          return truncateResult(result)
        })
      }
    }
  }

  private registerSandboxTools() {
    this.logger.log(`Sandbox tools enabled (${sandboxToolDefinitions.length} tools)`)
    for (const def of sandboxToolDefinitions) {
      this.tools.push(def)
      const executor = sandboxToolExecutors[def.name]
      if (executor) {
        this.executors.set(def.name, async (input) => {
          const { _apiKey, ...cleanInput } = input as Record<string, unknown> & { _apiKey?: string }
          if (!_apiKey) {
            return JSON.stringify({
              error: 'No Daytona API key configured for your account. ' + 'Please add it in the Settings panel.',
            })
          }
          const result = await executor(this.sandbox, cleanInput, _apiKey)
          return truncateResult(result)
        })
      }
    }
  }

  getToolDefinitions(): Anthropic.Tool[] {
    return this.tools
  }

  async execute(name: string, input: Record<string, unknown>, userId?: string): Promise<string> {
    const executor = this.executors.get(name)
    if (!executor) {
      return JSON.stringify({ error: `Unknown tool: ${name}` })
    }

    const timeoutMs = TOOL_TIMEOUTS[name] ?? DEFAULT_TIMEOUT_MS

    try {
      const result = await Promise.race([
        executor(input, userId),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Tool ${name} timed out after ${Math.round(timeoutMs / 1000)}s`)),
            timeoutMs,
          )
          // Don't keep the Node.js process alive for the timer
          if (typeof timer === 'object' && 'unref' in timer) (timer as NodeJS.Timeout).unref()
        }),
      ])
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Tool ${name} failed: ${message}`)
      return JSON.stringify({ error: message })
    }
  }

  isSandboxTool(name: string): boolean {
    return SANDBOX_TOOL_NAMES.has(name)
  }

  isReadOnlyTool(name: string): boolean {
    return !SIDE_EFFECT_TOOL_NAMES.has(name)
  }

  summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    return safeSummary(args) as Record<string, unknown>
  }
}
