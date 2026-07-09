/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { SettingsService, EffectiveOpensearchConfig } from '../../chat/settings.service'
import { DatasourceDisabledError } from '../datasource-disabled.error'
import { hashConfig } from '../datasource-hash'
import { PoolRegistry } from '../pool-registry'

interface Pool {
  client: AxiosInstance | null
  disabled: boolean
  lastUsedAt: number
}

@Injectable()
export class OpensearchService implements OnModuleDestroy {
  private readonly pools = new PoolRegistry<Pool>()

  constructor(private readonly settings: SettingsService) {}

  async onModuleDestroy() {
    await this.pools.shutdown()
  }

  async isEnabledFor(userId: string): Promise<boolean> {
    const cfg = await this.settings.getEffectiveOpensearchConfig(userId)
    return !cfg.disabled && !!cfg.url
  }

  async listOpensearchIndices(userId: string): Promise<unknown> {
    const client = await this.getClient(userId)
    const resp = await client.get('/_cat/indices', {
      params: { format: 'json', h: 'index,docs.count,store.size,status,health' },
    })
    const indices = (resp.data as Array<Record<string, string>>)
      .filter((i) => !i.index?.startsWith('.') || i.index?.startsWith('.ds-'))
      .sort((a, b) => (a.index || '').localeCompare(b.index || ''))
    return indices
  }

  async getOpensearchIndexMapping(index: string, userId: string): Promise<unknown> {
    const client = await this.getClient(userId)
    const resp = await client.get(`/${index}/_mapping`)
    return resp.data
  }

  async queryOpensearch(index: string, query: string, size: number, userId: string): Promise<unknown> {
    const client = await this.getClient(userId)
    let body: Record<string, unknown>
    try {
      body = JSON.parse(query)
    } catch (e) {
      throw new Error(`Invalid JSON in query: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!('size' in body)) {
      body.size = Math.min(size, 500)
    }
    const resp = await client.post(`/${index}/_search`, body)
    return resp.data
  }

  /**
   * Fetch a single document by its OpenSearch `_id` (i.e. `GET /<index>/_doc/<id>`).
   * Returns `{ found: false, source: null }` cleanly on 404 so callers can distinguish
   * "document missing" (a drift signal) from "OpenSearch error".
   *
   * Runs in system context (background sync, no user), so it always uses the
   * env-configured cluster — user overrides never apply here.
   */
  async getDocument(index: string, id: string): Promise<{ found: boolean; source: Record<string, unknown> | null }> {
    const client = await this.getSystemClient()
    try {
      const resp = await client.get(`/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`)
      const data = resp.data as { found?: boolean; _source?: Record<string, unknown> }
      if (data.found === false) {
        return { found: false, source: null }
      }
      return { found: true, source: data._source ?? null }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return { found: false, source: null }
      }
      throw err
    }
  }

  private async getClient(userId: string): Promise<AxiosInstance> {
    const cfg = await this.settings.getEffectiveOpensearchConfig(userId)
    const pool = await this.pools.getOrBuild(hashConfig(cfg), () => this.build(cfg))
    if (pool.disabled || !pool.client) throw new DatasourceDisabledError('opensearch', userId)
    return pool.client
  }

  private async getSystemClient(): Promise<AxiosInstance> {
    const cfg = this.settings.getEnvOpensearchConfig()
    const pool = await this.pools.getOrBuild(hashConfig(cfg), () => this.build(cfg))
    if (!pool.client) throw new Error('OpenSearch is not configured')
    return pool.client
  }

  private build(cfg: EffectiveOpensearchConfig): Pool {
    if (cfg.disabled || !cfg.url) {
      return { client: null, disabled: true, lastUsedAt: Date.now() }
    }
    const client = axios.create({
      baseURL: cfg.url.replace(/\/+$/, ''),
      timeout: 60_000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(cfg.username && cfg.password ? { auth: { username: cfg.username, password: cfg.password } } : {}),
    })
    return { client, disabled: false, lastUsedAt: Date.now() }
  }
}
