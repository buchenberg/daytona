/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name)
  private readonly client: AxiosInstance | null

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('mali.database.url')
    const token = this.configService.get<string>('mali.database.token')

    if (url && token) {
      this.client = axios.create({
        baseURL: url.replace(/\/+$/, ''),
        timeout: 120_000,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      this.logger.log('Database client initialized')
    } else {
      this.client = null
      this.logger.warn('Database client not configured (missing url or token)')
    }
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('Database is not configured')
    }
    return this.client
  }

  async queryDatabase(sql: string): Promise<unknown> {
    const resp = await this.getClient().post('/query', { sql })
    return resp.data
  }

  async listDatabaseTables(): Promise<unknown> {
    return this.queryDatabase(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
  }

  async describeDatabaseTable(tableName: string): Promise<unknown> {
    const safe = tableName.replace(/'/g, "''").replace(/;/g, '')
    return this.queryDatabase(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${safe}' ORDER BY ordinal_position`,
    )
  }
}
