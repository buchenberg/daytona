/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { InjectRedis } from '@nestjs-modules/ioredis'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import Redis from 'ioredis'

import { TypedConfigService } from '../../config/typed-config.service'
import { SandboxEvents } from '../constants/sandbox-events.constants'
import { SandboxArchivedEvent } from '../events/sandbox-archived.event'

@Injectable()
export class ProxyCacheInvalidationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProxyCacheInvalidationService.name)
  private static readonly RUNNER_INFO_CACHE_PREFIX = 'proxy:sandbox-runner-info:'
  private proxyEuRedis: Redis | null = null

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: TypedConfigService,
  ) {}

  onModuleInit(): void {
    const euRedisConfig = this.configService.getProxyEuRedisConfig()
    if (euRedisConfig) {
      this.proxyEuRedis = new Redis(euRedisConfig)
      this.proxyEuRedis.on('error', (err) => {
        this.logger.warn(`EU proxy Redis connection error: ${err.message}`)
      })
      this.logger.log('EU proxy Redis client initialized')
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.proxyEuRedis) {
      await this.proxyEuRedis.quit()
    }
  }

  @OnEvent(SandboxEvents.ARCHIVED)
  async handleSandboxArchived(event: SandboxArchivedEvent): Promise<void> {
    await this.invalidateRunnerCache(event.sandbox.id)
  }

  private async invalidateRunnerCache(sandboxId: string): Promise<void> {
    const key = `${ProxyCacheInvalidationService.RUNNER_INFO_CACHE_PREFIX}${sandboxId}`

    const results = await Promise.allSettled([
      this.deleteKey(this.redis, key, 'default'),
      ...(this.proxyEuRedis ? [this.deleteKey(this.proxyEuRedis, key, 'EU')] : []),
    ])

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`Failed to invalidate runner cache for sandbox ${sandboxId}: ${result.reason?.message}`)
      }
    }

    if (results.every((r) => r.status === 'fulfilled')) {
      this.logger.debug(`Successfully invalidated sandbox runner cache for ${sandboxId} in all Redis instances`)
    }
  }

  private async deleteKey(redis: Redis, key: string, label: string): Promise<void> {
    await redis.del(key)
    this.logger.debug(`Deleted cache key from ${label} Redis: ${key}`)
  }
}
