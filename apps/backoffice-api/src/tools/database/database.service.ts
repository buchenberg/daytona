/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SettingsService, EffectiveDatabaseConfig } from '../../chat/settings.service'
import { DatasourceDisabledError } from '../datasource-disabled.error'
import { hashConfig } from '../datasource-hash'
import { PoolRegistry } from '../pool-registry'

const POOL_SIZE = 5

// Each pool is a full postgres connection pool, so keep far fewer of them
// around than the axios-based services do.
const MAX_POOLS = 10

interface Pool {
  client: DataSource | null
  disabled: boolean
  lastUsedAt: number
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)
  private readonly pools = new PoolRegistry<Pool>({
    maxEntries: MAX_POOLS,
    dispose: async (pool) => {
      if (!pool.client?.isInitialized) return
      try {
        await pool.client.destroy()
      } catch (e) {
        this.logger.warn(`Failed to dispose database pool: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  })

  constructor(private readonly settings: SettingsService) {}

  async onModuleDestroy() {
    await this.pools.shutdown()
  }

  async isEnabledFor(userId: string): Promise<boolean> {
    const cfg = await this.settings.getEffectiveDatabaseConfig(userId)
    return !cfg.disabled && !!cfg.host && !!cfg.username
  }

  async queryDatabase(sql: string, userId: string): Promise<unknown> {
    const client = await this.getClient(userId)
    const rows = await client.query(sql)
    return { rows, rowCount: rows.length }
  }

  async listDatabaseTables(userId: string): Promise<unknown> {
    return this.queryDatabase(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      userId,
    )
  }

  async describeDatabaseTable(tableName: string, userId: string): Promise<unknown> {
    const safe = tableName.replace(/'/g, "''").replace(/;/g, '')
    return this.queryDatabase(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${safe}' ORDER BY ordinal_position`,
      userId,
    )
  }

  private async getClient(userId: string): Promise<DataSource> {
    const cfg = await this.settings.getEffectiveDatabaseConfig(userId)
    const pool = await this.pools.getOrBuild(hashConfig(cfg), () => this.build(cfg))
    if (pool.disabled || !pool.client) throw new DatasourceDisabledError('database', userId)
    return pool.client
  }

  private async build(cfg: EffectiveDatabaseConfig): Promise<Pool> {
    if (cfg.disabled || !cfg.host || !cfg.username) {
      return { client: null, disabled: true, lastUsedAt: Date.now() }
    }

    const client = new DataSource({
      type: 'postgres',
      host: cfg.host,
      port: cfg.port ?? 5432,
      username: cfg.username,
      password: cfg.password ?? '',
      database: cfg.database ?? 'application_ctx',
      poolSize: POOL_SIZE,
      ssl: cfg.tls?.enabled ? { rejectUnauthorized: cfg.tls?.rejectUnauthorized ?? true } : false,
    })

    try {
      await client.initialize()
    } catch (e) {
      this.logger.error(`Database init failed: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
    return { client, disabled: false, lastUsedAt: Date.now() }
  }
}
