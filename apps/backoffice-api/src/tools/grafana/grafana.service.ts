/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

@Injectable()
export class GrafanaService {
  private readonly logger = new Logger(GrafanaService.name)
  private readonly client: AxiosInstance | null
  private readonly _dsIdCache = new Map<string, number>()

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('mali.grafana.url')
    const token = this.configService.get<string>('mali.grafana.token')

    if (url && token) {
      this.client = axios.create({
        baseURL: url.replace(/\/+$/, ''),
        timeout: 60_000,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })
      this.logger.log('Grafana client initialized')
    } else {
      this.client = null
      this.logger.warn('Grafana client not configured (missing url or token)')
    }
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('Grafana is not configured')
    }
    return this.client
  }

  private async resolveDsId(uid: string): Promise<number> {
    const cached = this._dsIdCache.get(uid)
    if (cached !== undefined) return cached

    const resp = await this.getClient().get(`/api/datasources/uid/${uid}`)
    const id = resp.data.id as number
    this._dsIdCache.set(uid, id)
    return id
  }

  private proxyPath(dsId: number): string {
    return `/api/datasources/proxy/${dsId}`
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

  async listDatasources(): Promise<unknown[]> {
    const resp = await this.getClient().get('/api/datasources')
    const raw = resp.data as Array<Record<string, unknown>>
    for (const ds of raw) {
      this._dsIdCache.set(ds.uid as string, ds.id as number)
    }
    return raw.map((ds) => ({
      uid: ds.uid,
      id: ds.id,
      name: ds.name,
      type: ds.type,
      url: ds.url || '',
      is_default: ds.isDefault || false,
    }))
  }

  async getDatasourceByName(name: string): Promise<unknown> {
    const resp = await this.getClient().get(`/api/datasources/name/${name}`)
    return resp.data
  }

  async queryPrometheus(datasourceUid: string, query: string, time?: string): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const params: Record<string, string> = { query }
    if (time) params.time = GrafanaService.parseTime(time)
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/api/v1/query`, { params })
    return resp.data
  }

  async queryPrometheusRange(
    datasourceUid: string,
    query: string,
    start: string,
    end: string,
    step: string,
  ): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const params = {
      query,
      start: GrafanaService.parseTime(start),
      end: GrafanaService.parseTime(end),
      step,
    }
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/api/v1/query_range`, { params })
    return resp.data
  }

  async listPrometheusLabelNames(datasourceUid: string): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/api/v1/labels`)
    return resp.data
  }

  async getPrometheusLabelValues(datasourceUid: string, labelName: string): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/api/v1/label/${labelName}/values`)
    return resp.data
  }

  async getPrometheusMetricMetadata(datasourceUid: string, metric?: string): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const params: Record<string, string> = {}
    if (metric) params.metric = metric
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/api/v1/metadata`, { params })
    return resp.data
  }

  async queryLoki(
    datasourceUid: string,
    query: string,
    start?: string,
    end?: string,
    limit = 100,
    direction = 'backward',
  ): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const params: Record<string, string> = {
      query,
      start: GrafanaService.parseTime(start || 'now-1h'),
      end: GrafanaService.parseTime(end || 'now'),
      limit: String(Math.min(limit, 5000)),
      direction,
    }
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/loki/api/v1/query_range`, { params })
    return resp.data
  }

  async listLokiLabelNames(datasourceUid: string): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/loki/api/v1/labels`)
    return resp.data
  }

  async getLokiLabelValues(datasourceUid: string, labelName: string): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/loki/api/v1/label/${labelName}/values`)
    return resp.data
  }

  async searchTempoTraces(
    datasourceUid: string,
    q?: string,
    tags?: string,
    minDuration?: string,
    maxDuration?: string,
    limit = 20,
    start?: string,
    end?: string,
  ): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const params: Record<string, string> = { limit: String(limit) }
    if (q) params.q = q
    if (tags) params.tags = tags
    if (minDuration) params.minDuration = minDuration
    if (maxDuration) params.maxDuration = maxDuration
    if (start) params.start = GrafanaService.parseTime(start)
    if (end) params.end = GrafanaService.parseTime(end)
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/api/search`, { params })
    return resp.data
  }

  async getTempoTrace(datasourceUid: string, traceId: string): Promise<unknown> {
    const dsId = await this.resolveDsId(datasourceUid)
    const resp = await this.getClient().get(`${this.proxyPath(dsId)}/api/traces/${traceId}`)
    return resp.data
  }

  async searchDashboards(query?: string, tag?: string): Promise<unknown> {
    const params: Record<string, string> = { type: 'dash-db' }
    if (query) params.query = query
    if (tag) params.tag = tag
    const resp = await this.getClient().get('/api/search', { params })
    return resp.data
  }

  async getDashboard(uid: string): Promise<unknown> {
    const resp = await this.getClient().get(`/api/dashboards/uid/${uid}`)
    return resp.data
  }

  async getAlertRules(): Promise<unknown> {
    const resp = await this.getClient().get('/api/ruler/grafana/api/v1/rules')
    return resp.data
  }

  async getFiringAlerts(): Promise<unknown> {
    const resp = await this.getClient().get('/api/alertmanager/grafana/api/v2/alerts')
    return resp.data
  }
}
