import { Injectable, OnModuleDestroy } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { SettingsService, EffectiveClickhouseConfig } from '../../chat/settings.service'
import { DatasourceDisabledError } from '../datasource-disabled.error'
import { hashConfig } from '../datasource-hash'
import { PoolRegistry } from '../pool-registry'

interface Pool {
  client: AxiosInstance | null
  baseUrl: string | null
  disabled: boolean
  lastUsedAt: number
}

@Injectable()
export class ClickhouseService implements OnModuleDestroy {
  private readonly pools = new PoolRegistry<Pool>()

  constructor(private readonly settings: SettingsService) {}

  async onModuleDestroy() {
    await this.pools.shutdown()
  }

  async isEnabledFor(userId: string): Promise<boolean> {
    const cfg = await this.settings.getEffectiveClickhouseConfig(userId)
    return !cfg.disabled && !!cfg.serviceId && !!cfg.keyId && !!cfg.keySecret
  }

  async queryClickhouse(sql: string, userId: string): Promise<unknown[]> {
    const { client, baseUrl } = await this.getContext(userId)
    const resp = await client.post(
      baseUrl,
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

  async listClickhouseTables(database: string, userId: string): Promise<unknown[]> {
    return this.queryClickhouse(`SHOW TABLES FROM ${database}`, userId)
  }

  async describeClickhouseTable(table: string, database: string, userId: string): Promise<unknown[]> {
    return this.queryClickhouse(`DESCRIBE ${database}.${table}`, userId)
  }

  private async getContext(userId: string): Promise<{ client: AxiosInstance; baseUrl: string }> {
    const cfg = await this.settings.getEffectiveClickhouseConfig(userId)
    const pool = await this.pools.getOrBuild(hashConfig(cfg), () => this.build(cfg))
    if (pool.disabled || !pool.client || !pool.baseUrl) {
      throw new DatasourceDisabledError('clickhouse', userId)
    }
    return { client: pool.client, baseUrl: pool.baseUrl }
  }

  private build(cfg: EffectiveClickhouseConfig): Pool {
    if (cfg.disabled || !cfg.serviceId || !cfg.keyId || !cfg.keySecret) {
      return { client: null, baseUrl: null, disabled: true, lastUsedAt: Date.now() }
    }
    const baseUrl = `https://queries.clickhouse.cloud/service/${cfg.serviceId}/run`
    const client = axios.create({
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
      auth: { username: cfg.keyId, password: cfg.keySecret },
    })
    return { client, baseUrl, disabled: false, lastUsedAt: Date.now() }
  }
}
