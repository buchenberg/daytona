/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { SettingsService, EffectivePosthogConfig } from '../../chat/settings.service'
import { DatasourceDisabledError } from '../datasource-disabled.error'
import { hashConfig } from '../datasource-hash'
import { PoolRegistry } from '../pool-registry'

interface Pool {
  client: AxiosInstance | null
  projectId: string | null
  disabled: boolean
  lastUsedAt: number
}

@Injectable()
export class PosthogService implements OnModuleDestroy {
  private readonly pools = new PoolRegistry<Pool>()

  constructor(private readonly settings: SettingsService) {}

  async onModuleDestroy() {
    await this.pools.shutdown()
  }

  async isEnabledFor(userId: string): Promise<boolean> {
    const cfg = await this.settings.getEffectivePosthogConfig(userId)
    return !cfg.disabled && !!cfg.host && !!cfg.apiKey && !!cfg.projectId
  }

  private async getContext(userId: string): Promise<{ client: AxiosInstance; projectId: string }> {
    const cfg = await this.settings.getEffectivePosthogConfig(userId)
    const pool = await this.pools.getOrBuild(hashConfig(cfg), () => this.build(cfg))
    if (pool.disabled || !pool.client || !pool.projectId) {
      throw new DatasourceDisabledError('posthog', userId)
    }
    return { client: pool.client, projectId: pool.projectId }
  }

  private build(cfg: EffectivePosthogConfig): Pool {
    if (cfg.disabled || !cfg.host || !cfg.apiKey || !cfg.projectId) {
      return { client: null, projectId: null, disabled: true, lastUsedAt: Date.now() }
    }
    const client = axios.create({
      baseURL: cfg.host.replace(/\/+$/, ''),
      timeout: 120_000,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
    })
    return { client, projectId: cfg.projectId, disabled: false, lastUsedAt: Date.now() }
  }

  async queryPosthog(query: string, userId: string): Promise<unknown> {
    const { client, projectId } = await this.getContext(userId)
    const resp = await client.post(`/api/projects/${projectId}/query/`, {
      query: { kind: 'HogQLQuery', query },
    })
    return this.formatResults(resp.data)
  }

  async listPosthogEvents(userId: string): Promise<unknown> {
    const { client, projectId } = await this.getContext(userId)
    const results: Array<Record<string, unknown>> = []
    let url: string | null = `/api/projects/${projectId}/event_definitions/`
    let params: Record<string, unknown> | undefined = { limit: 100, ordering: '-query_usage_30_day' }

    while (url && results.length < 500) {
      const resp = await client.get(url, { params })
      const data = resp.data as Record<string, unknown>
      const items = (data.results as Array<Record<string, unknown>>) || []
      for (const item of items) {
        results.push({
          name: item.name,
          volume_30_day: item.volume_30_day,
          query_usage_30_day: item.query_usage_30_day,
          last_seen_at: item.last_seen_at,
        })
      }
      url = (data.next as string) || null
      params = undefined
    }

    return results
  }

  async listPosthogProperties(eventName: string | undefined, userId: string): Promise<unknown> {
    const { client, projectId } = await this.getContext(userId)
    const results: Array<Record<string, unknown>> = []
    let url: string | null = `/api/projects/${projectId}/property_definitions/`
    let params: Record<string, unknown> | undefined = { limit: 100 }

    if (eventName) {
      params.event_names = JSON.stringify([eventName])
      params.filter_by_event_names = 'true'
    }

    while (url && results.length < 500) {
      const resp = await client.get(url, { params })
      const data = resp.data as Record<string, unknown>
      const items = (data.results as Array<Record<string, unknown>>) || []
      for (const item of items) {
        results.push({
          name: item.name,
          property_type: item.property_type,
          is_numerical: item.is_numerical,
          query_usage_30_day: item.query_usage_30_day,
        })
      }
      url = (data.next as string) || null
      params = undefined
    }

    return results
  }

  private formatResults(data: Record<string, unknown>): Record<string, unknown> {
    const columns = (data.columns as string[]) || []
    const rows = (data.results as unknown[][]) || []
    const hogql = data.hogql as string | undefined

    const formatted: Record<string, unknown> = {}
    if (hogql) formatted.executed_sql = hogql
    formatted.columns = columns
    formatted.row_count = rows.length

    if (rows.length > 0) {
      formatted.results = rows.map((row) => {
        const obj: Record<string, unknown> = {}
        columns.forEach((col, i) => {
          obj[col] = row[i]
        })
        return obj
      })
    } else {
      formatted.results = []
    }

    if (data.hasMore) formatted.has_more = true

    return formatted
  }
}
