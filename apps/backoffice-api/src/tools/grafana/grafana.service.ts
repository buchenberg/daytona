/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { SettingsService, EffectiveGrafanaConfig } from '../../chat/settings.service'
import { DatasourceDisabledError } from '../datasource-disabled.error'
import { hashConfig } from '../datasource-hash'
import { PoolRegistry } from '../pool-registry'

interface Pool {
  client: AxiosInstance | null
  disabled: boolean
  lastUsedAt: number
}

@Injectable()
export class GrafanaService implements OnModuleDestroy {
  private readonly pools = new PoolRegistry<Pool>()

  constructor(private readonly settings: SettingsService) {}

  async onModuleDestroy() {
    await this.pools.shutdown()
  }

  async isEnabledFor(userId: string): Promise<boolean> {
    const cfg = await this.settings.getEffectiveGrafanaConfig(userId)
    return !cfg.disabled && !!cfg.url && !!cfg.token
  }

  private async getContext(userId: string): Promise<{ client: AxiosInstance }> {
    const cfg = await this.settings.getEffectiveGrafanaConfig(userId)
    const pool = await this.pools.getOrBuild(hashConfig(cfg), () => this.build(cfg))
    if (pool.disabled || !pool.client) throw new DatasourceDisabledError('grafana', userId)
    return { client: pool.client }
  }

  private build(cfg: EffectiveGrafanaConfig): Pool {
    if (cfg.disabled || !cfg.url || !cfg.token) {
      return { client: null, disabled: true, lastUsedAt: Date.now() }
    }
    const client = axios.create({
      baseURL: cfg.url.replace(/\/+$/, ''),
      timeout: 60_000,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
    // Surface method + path in errors — a bare "status code 404" is
    // undebuggable from logs and useless to the model for self-correction.
    client.interceptors.response.use(undefined, (error) => {
      if (axios.isAxiosError(error) && error.response) {
        const method = error.config?.method?.toUpperCase() ?? 'GET'
        error.message = `Grafana request failed: ${error.response.status} ${method} ${error.config?.url}`
      }
      return Promise.reject(error)
    })
    return { client, disabled: false, lastUsedAt: Date.now() }
  }

  /**
   * UID-based proxy base path. The numeric-id form (/api/datasources/proxy/:id)
   * was removed in Grafana 11 and 404s there.
   */
  private proxyPath(uid: string): string {
    return `/api/datasources/proxy/uid/${encodeURIComponent(uid)}`
  }

  static parseTime(timeStr: string): string {
    if (!timeStr) return String(Math.floor(Date.now() / 1000))

    const s = timeStr.trim()

    const num = Number(s)
    if (!isNaN(num)) return s

    const now = Date.now() / 1000

    if (s === 'now') return String(Math.floor(now))

    if (s.startsWith('now-')) {
      const secs = GrafanaService.parseDuration(s.slice(4))
      return String(Math.floor(now - secs))
    }

    if (s.startsWith('now+')) {
      const secs = GrafanaService.parseDuration(s.slice(4))
      return String(Math.floor(now + secs))
    }

    try {
      const dt = new Date(s.replace('Z', '+00:00'))
      if (!isNaN(dt.getTime())) return String(Math.floor(dt.getTime() / 1000))
    } catch {
      // fall through
    }

    return s
  }

  private static parseDuration(s: string): number {
    const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }
    let total = 0
    let current = ''
    for (const c of s) {
      if (c >= '0' && c <= '9') {
        current += c
      } else if (units[c] && current) {
        total += parseInt(current, 10) * units[c]
        current = ''
      }
    }
    return total > 0 ? total : 3600
  }

  async listDatasources(userId: string): Promise<unknown[]> {
    const { client } = await this.getContext(userId)
    const resp = await client.get('/api/datasources')
    const raw = resp.data as Array<Record<string, unknown>>
    // Only uid/name/type: exposing the numeric id invites the model to pass it
    // where a UID is expected.
    return raw.map((ds) => ({
      uid: ds.uid,
      name: ds.name,
      type: ds.type,
      is_default: ds.isDefault || false,
    }))
  }

  async getDatasourceByName(name: string, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get(`/api/datasources/name/${name}`)
    return resp.data
  }

  async queryPrometheus(
    datasourceUid: string,
    query: string,
    time: string | undefined,
    userId: string,
  ): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const params: Record<string, string> = { query }
    if (time) params.time = GrafanaService.parseTime(time)
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/api/v1/query`, { params })
    return resp.data
  }

  async queryPrometheusRange(
    datasourceUid: string,
    query: string,
    start: string,
    end: string,
    step: string,
    userId: string,
  ): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const params = {
      query,
      start: GrafanaService.parseTime(start),
      end: GrafanaService.parseTime(end),
      step,
    }
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/api/v1/query_range`, { params })
    return resp.data
  }

  async listPrometheusLabelNames(datasourceUid: string, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/api/v1/labels`)
    return resp.data
  }

  async getPrometheusLabelValues(datasourceUid: string, labelName: string, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/api/v1/label/${labelName}/values`)
    return resp.data
  }

  async getPrometheusMetricMetadata(
    datasourceUid: string,
    metric: string | undefined,
    userId: string,
  ): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const params: Record<string, string> = {}
    if (metric) params.metric = metric
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/api/v1/metadata`, { params })
    return resp.data
  }

  async queryLoki(
    datasourceUid: string,
    query: string,
    start: string | undefined,
    end: string | undefined,
    limit: number,
    direction: string,
    userId: string,
  ): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const params: Record<string, string> = {
      query,
      start: GrafanaService.parseTime(start || 'now-1h'),
      end: GrafanaService.parseTime(end || 'now'),
      limit: String(Math.min(limit, 5000)),
      direction,
    }
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/loki/api/v1/query_range`, { params })
    return resp.data
  }

  async listLokiLabelNames(datasourceUid: string, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/loki/api/v1/labels`)
    return resp.data
  }

  async getLokiLabelValues(datasourceUid: string, labelName: string, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/loki/api/v1/label/${labelName}/values`)
    return resp.data
  }

  async searchTempoTraces(
    datasourceUid: string,
    q: string | undefined,
    tags: string | undefined,
    minDuration: string | undefined,
    maxDuration: string | undefined,
    limit: number,
    start: string | undefined,
    end: string | undefined,
    userId: string,
  ): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const params: Record<string, string> = { limit: String(limit) }
    if (q) params.q = q
    if (tags) params.tags = tags
    if (minDuration) params.minDuration = minDuration
    if (maxDuration) params.maxDuration = maxDuration
    if (start) params.start = GrafanaService.parseTime(start)
    if (end) params.end = GrafanaService.parseTime(end)
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/api/search`, { params })
    return resp.data
  }

  async getTempoTrace(datasourceUid: string, traceId: string, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get(`${this.proxyPath(datasourceUid)}/api/traces/${traceId}`)
    return resp.data
  }

  async searchDashboards(query: string | undefined, tag: string | undefined, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const params: Record<string, string> = { type: 'dash-db' }
    if (query) params.query = query
    if (tag) params.tag = tag
    const resp = await client.get('/api/search', { params })
    return resp.data
  }

  async getDashboard(uid: string, userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get(`/api/dashboards/uid/${uid}`)
    return resp.data
  }

  async getAlertRules(userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get('/api/ruler/grafana/api/v1/rules')
    return resp.data
  }

  async getFiringAlerts(userId: string): Promise<unknown> {
    const { client } = await this.getContext(userId)
    const resp = await client.get('/api/alertmanager/grafana/api/v2/alerts')
    return resp.data
  }
}
