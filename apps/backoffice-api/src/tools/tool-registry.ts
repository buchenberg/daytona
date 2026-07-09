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
import { DatasourceDisabledError } from './datasource-disabled.error'
import { truncateResult, safeSummary } from './truncate'

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

/** Signature every category's tool executor implements. */
export type ToolExecutor<S> = (service: S, input: Record<string, unknown>, userId: string) => Promise<unknown>

/** Every datasource service gates its own per-user availability. */
interface DatasourceService {
  isEnabledFor(userId: string): Promise<boolean>
}

type Entry = {
  tool: Anthropic.Tool
  service: DatasourceService
  execute: (input: Record<string, unknown>, userId: string) => Promise<string>
}

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name)
  private readonly entries = new Map<string, Entry>()

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
    this.registerCategory('Sandbox', this.sandbox, sandboxToolDefinitions, sandboxToolExecutors)

    this.logger.log(`Tool registry initialized with ${this.entries.size} tools`)
  }

  private registerCategory<S extends DatasourceService>(
    name: string,
    service: S,
    definitions: readonly Anthropic.Tool[],
    executors: Record<string, ToolExecutor<S>>,
  ) {
    this.logger.log(`${name} tools registered (${definitions.length} tools, per-user availability)`)
    for (const def of definitions) {
      const executor = executors[def.name]
      if (!executor) continue
      this.entries.set(def.name, {
        tool: def,
        service,
        execute: async (input, userId) => truncateResult(await executor(service, input, userId)),
      })
    }
  }

  /**
   * Tools the given user is allowed to use right now. Per-user availability
   * is determined by each service's `isEnabledFor(userId)`, backed by
   * SettingsService's short-TTL overrides cache — so repeat calls are cheap.
   */
  async listAvailableTools(userId: string): Promise<Anthropic.Tool[]> {
    const checks = await Promise.all(
      Array.from(this.entries.values()).map(async (e) => ({
        tool: e.tool,
        available: await e.service.isEnabledFor(userId),
      })),
    )
    return checks.filter((c) => c.available).map((c) => c.tool)
  }

  async execute(name: string, input: Record<string, unknown>, userId: string): Promise<string> {
    const entry = this.entries.get(name)
    if (!entry) {
      return JSON.stringify({ error: `Unknown tool: ${name}` })
    }

    const timeoutMs = TOOL_TIMEOUTS[name] ?? DEFAULT_TIMEOUT_MS

    try {
      const result = await Promise.race([
        entry.execute(input, userId),
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
      if (error instanceof DatasourceDisabledError) {
        this.logger.debug(`Tool ${name} blocked: ${error.message}`)
        return JSON.stringify({ error: error.message })
      }
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Tool ${name} failed: ${message}`)
      return JSON.stringify({ error: message })
    }
  }

  isReadOnlyTool(name: string): boolean {
    return !SIDE_EFFECT_TOOL_NAMES.has(name)
  }

  summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    return safeSummary(args) as Record<string, unknown>
  }
}
