/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

@Injectable()
export class OpensearchService {
  private readonly logger = new Logger(OpensearchService.name)
  private readonly client: AxiosInstance | null

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('mali.opensearch.url')
    const username = this.configService.get<string>('mali.opensearch.username')
    const password = this.configService.get<string>('mali.opensearch.password')

    if (url) {
      this.client = axios.create({
        baseURL: url.replace(/\/+$/, ''),
        timeout: 60_000,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(username && password ? { auth: { username, password } } : {}),
      })
      this.logger.log('OpenSearch client initialized')
    } else {
      this.client = null
      this.logger.warn('OpenSearch client not configured (missing url)')
    }
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('OpenSearch is not configured')
    }
    return this.client
  }

  async listOpensearchIndices(): Promise<unknown> {
    const resp = await this.getClient().get('/_cat/indices', {
      params: { format: 'json', h: 'index,docs.count,store.size,status,health' },
    })
    const indices = (resp.data as Array<Record<string, string>>)
      .filter((i) => !i.index?.startsWith('.') || i.index?.startsWith('.ds-'))
      .sort((a, b) => (a.index || '').localeCompare(b.index || ''))
    return indices
  }

  async getOpensearchIndexMapping(index: string): Promise<unknown> {
    const resp = await this.getClient().get(`/${index}/_mapping`)
    return resp.data
  }

  async queryOpensearch(index: string, query: string, size = 100): Promise<unknown> {
    let body: Record<string, unknown>
    try {
      body = JSON.parse(query)
    } catch (e) {
      throw new Error(`Invalid JSON in query: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (!('size' in body)) {
      body.size = Math.min(size, 500)
    }

    const resp = await this.getClient().post(`/${index}/_search`, body)
    return resp.data
  }

  /**
   * Fetch a single document by its OpenSearch `_id` (i.e. `GET /<index>/_doc/<id>`).
   * Returns `{ found: false, source: null }` cleanly on 404 so callers can distinguish
   * "document missing" (a drift signal) from "OpenSearch error".
   */
  async getDocument(index: string, id: string): Promise<{ found: boolean; source: Record<string, unknown> | null }> {
    try {
      const resp = await this.getClient().get(`/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`)
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
}
