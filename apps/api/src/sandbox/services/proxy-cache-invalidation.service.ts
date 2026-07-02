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
import { SandboxPublicStatusUpdatedEvent } from '../events/sandbox-public-status-updated.event'

@Injectable()
export class ProxyCacheInvalidationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProxyCacheInvalidationService.name)
  private static readonly RUNNER_INFO_CACHE_PREFIX = 'proxy:sandbox-runner-info:'
  private proxyEuRedis: Redis | null = null
  private static readonly PUBLIC_CACHE_PREFIX = 'proxy:sandbox-public:'
  private static readonly API_PUBLIC_CACHE_PREFIX = 'preview:public:'

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

  @OnEvent(SandboxEvents.PUBLIC_STATUS_UPDATED)
  async handleSandboxPublicStatusUpdated(event: SandboxPublicStatusUpdatedEvent): Promise<void> {
    await this.invalidatePublicCache(event.sandbox.id)
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

  private async invalidatePublicCache(sandboxId: string): Promise<void> {
    // Evict the API-side decision cache BEFORE the proxy-side cache.
    // The proxy only re-queries the API on a cache miss, and a miss can only
    // occur after the proxy key is gone. Deleting the API key first guarantees
    // any such re-query does a fresh lookup (now private) instead of reading a
    // stale 'public' decision and re-poisoning the proxy's longer-lived cache.
    try {
      await this.redis.del(`${ProxyCacheInvalidationService.API_PUBLIC_CACHE_PREFIX}${sandboxId}`)
      this.logger.debug(`Invalidated API public-status cache for ${sandboxId}`)
    } catch (error) {
      // If the API-side entry is still present, evicting the proxy key now would let the next proxy
      // miss re-read the stale 'public' decision and re-prime the proxy for a fresh TTL — worse than
      // leaving the existing proxy entry to expire. Skip proxy eviction; do not throw (the visibility
      // change must still succeed). The entry self-expires at its TTL.
      this.logger.warn(
        `Failed to invalidate API public-status cache for sandbox ${sandboxId}; skipping proxy eviction to avoid re-priming: ${error.message}`,
      )
      return
    }

    // The proxy-side cache is per-region: each proxy writes it to its own Redis, so the EU proxy
    // holds its copy in proxyEuRedis, not this.redis. Evict from every region (mirrors
    // invalidateRunnerCache) or a public→private change stays stale at the EU proxy until TTL.
    const proxyKey = `${ProxyCacheInvalidationService.PUBLIC_CACHE_PREFIX}${sandboxId}`
    const results = await Promise.allSettled([
      this.deleteKey(this.redis, proxyKey, 'default'),
      ...(this.proxyEuRedis ? [this.deleteKey(this.proxyEuRedis, proxyKey, 'EU')] : []),
    ])
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`Failed to invalidate public cache for sandbox ${sandboxId}: ${result.reason?.message}`)
      }
    }
  }
}
