/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

@Injectable()
export class ClickhouseService {
  private readonly logger = new Logger(ClickhouseService.name)
  private readonly client: AxiosInstance | null
  private readonly baseUrl: string | null

  constructor(private readonly configService: ConfigService) {
    const serviceId = this.configService.get<string>('mali.clickhouse.serviceId')
    const keyId = this.configService.get<string>('mali.clickhouse.keyId')
    const keySecret = this.configService.get<string>('mali.clickhouse.keySecret')

    if (serviceId && keyId && keySecret) {
      this.baseUrl = `https://queries.clickhouse.cloud/service/${serviceId}/run`
      this.client = axios.create({
        timeout: 30_000,
        headers: { 'Content-Type': 'application/json' },
        auth: { username: keyId, password: keySecret },
      })
      this.logger.log('ClickHouse client initialized')
    } else {
      this.baseUrl = null
      this.client = null
      this.logger.warn('ClickHouse client not configured (missing serviceId, keyId, or keySecret)')
    }
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('ClickHouse is not configured')
    }
    return this.client
  }

  async queryClickhouse(sql: string): Promise<unknown[]> {
    const url = this.baseUrl as string
    const resp = await this.getClient().post(
      url,
      { sql },
      {
        params: { format: 'JSONEachRow' },
        responseType: 'text',
        transformResponse: [(data: string) => data],
      },
    )
    const lines = (resp.data as string).trim().split('\n')
    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line))
  }

  async listClickhouseTables(database = 'billing'): Promise<unknown[]> {
    return this.queryClickhouse(`SHOW TABLES FROM ${database}`)
  }

  async describeClickhouseTable(table: string, database = 'billing'): Promise<unknown[]> {
    return this.queryClickhouse(`DESCRIBE ${database}.${table}`)
  }
}
