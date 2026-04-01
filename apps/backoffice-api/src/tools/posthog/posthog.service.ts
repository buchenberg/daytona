/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

@Injectable()
export class PosthogService {
  private readonly logger = new Logger(PosthogService.name)
  private readonly client: AxiosInstance | null
  private readonly projectId: string | null

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mali.posthog.host')
    const apiKey = this.configService.get<string>('mali.posthog.apiKey')
    const projectId = this.configService.get<string>('mali.posthog.projectId')

    if (host && apiKey && projectId) {
      this.projectId = projectId
      this.client = axios.create({
        baseURL: host.replace(/\/+$/, ''),
        timeout: 120_000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })
      this.logger.log('PostHog client initialized')
    } else {
      this.projectId = null
      this.client = null
      this.logger.warn('PostHog client not configured (missing host, apiKey, or projectId)')
    }
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('PostHog is not configured')
    }
    return this.client
  }

  async queryPosthog(query: string): Promise<unknown> {
    const resp = await this.getClient().post(`/api/projects/${this.projectId}/query/`, {
      query: { kind: 'HogQLQuery', query },
    })
    return this.formatResults(resp.data)
  }

  async listPosthogEvents(): Promise<unknown> {
    const results: Array<Record<string, unknown>> = []
    let url: string | null = `/api/projects/${this.projectId}/event_definitions/`
    let params: Record<string, unknown> | undefined = { limit: 100, ordering: '-query_usage_30_day' }

    while (url && results.length < 500) {
      const resp = await this.getClient().get(url, { params })
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

  async listPosthogProperties(eventName?: string): Promise<unknown> {
    const results: Array<Record<string, unknown>> = []
    let url: string | null = `/api/projects/${this.projectId}/property_definitions/`
    let params: Record<string, unknown> | undefined = { limit: 100 }

    if (eventName) {
      params.event_names = JSON.stringify([eventName])
      params.filter_by_event_names = 'true'
    }

    while (url && results.length < 500) {
      const resp = await this.getClient().get(url, { params })
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
