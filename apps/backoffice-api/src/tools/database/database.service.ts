/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)
  private dataSource: DataSource | null = null

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mali.database.host')
    const username = this.configService.get<string>('mali.database.username')

    if (host && username) {
      this.dataSource = new DataSource({
        type: 'postgres',
        host,
        port: this.configService.get<number>('mali.database.port') ?? 5432,
        username,
        password: this.configService.get<string>('mali.database.password') ?? '',
        database: this.configService.get<string>('mali.database.database') ?? 'application_ctx',
        ssl: this.configService.get<boolean>('mali.database.tls.enabled')
          ? { rejectUnauthorized: this.configService.get<boolean>('mali.database.tls.rejectUnauthorized') ?? true }
          : false,
      })

      this.dataSource
        .initialize()
        .then(() => this.logger.log('Database client initialized'))
        .catch((err) => {
          this.logger.error(`Database connection failed: ${err.message}`)
          this.dataSource = null
        })
    } else {
      this.logger.warn('Database client not configured (missing host or username)')
    }
  }

  async onModuleDestroy() {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy()
    }
  }

  isConfigured(): boolean {
    return this.dataSource !== null
  }

  private getDataSource(): DataSource {
    if (!this.dataSource?.isInitialized) {
      throw new Error('Database is not configured or not connected')
    }
    return this.dataSource
  }

  async queryDatabase(sql: string): Promise<unknown> {
    const rows = await this.getDataSource().query(sql)
    return { rows, rowCount: rows.length }
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
