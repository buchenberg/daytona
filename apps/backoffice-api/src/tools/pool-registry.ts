/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DISABLED_HASH } from './datasource-hash'

/**
 * Shared cache for per-datasource-service client pools. Every tool service has
 * the same shape: `Map<configHash, Pool>` + eviction + shutdown disposal. This
 * class owns all three.
 *
 * Pools are bucketed by `hashConfig(effectiveConfig)` so two users with the
 * same effective config share one pool. Users sharing the "disabled" bucket
 * all land under `DISABLED_HASH`, which is never evicted (it holds no real
 * resources; there's nothing to dispose).
 *
 * Eviction is two-fold, both calling `dispose`:
 *   - idle sweep: pools unused for `idleMs` are dropped every `sweepMs`
 *   - LRU cap: the registry never holds more than `maxEntries` real pools,
 *     so a burst of distinct configs can't grow resource usage unboundedly
 */

export interface HasIdle {
  lastUsedAt: number
}

export interface PoolRegistryOptions<P> {
  idleMs?: number
  sweepMs?: number
  maxEntries?: number
  dispose?: (pool: P) => void | Promise<void>
}

const DEFAULT_IDLE_MS = 30 * 60 * 1000
const DEFAULT_SWEEP_MS = 5 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 50

export class PoolRegistry<P extends HasIdle> {
  private readonly map = new Map<string, P>()
  private readonly building = new Map<string, Promise<P>>()
  private readonly timer: NodeJS.Timeout
  private readonly idleMs: number
  private readonly maxEntries: number

  constructor(private readonly opts: PoolRegistryOptions<P> = {}) {
    this.idleMs = opts.idleMs ?? DEFAULT_IDLE_MS
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.timer = setInterval(() => this.sweep(), opts.sweepMs ?? DEFAULT_SWEEP_MS)
    this.timer.unref?.()
  }

  /**
   * Look up a pool by hash; if missing, call `build()`, store the result, and
   * return it. Concurrent calls for the same hash share one build — two
   * simultaneous first uses can't leak a second pool. Always bumps
   * `lastUsedAt` on the returned pool so eviction keeps it warm while active.
   */
  async getOrBuild(hash: string, build: () => P | Promise<P>): Promise<P> {
    let pool = this.map.get(hash)
    if (!pool) {
      let pending = this.building.get(hash)
      if (!pending) {
        pending = Promise.resolve().then(build)
        this.building.set(hash, pending)
      }
      try {
        pool = await pending
      } finally {
        this.building.delete(hash)
      }
      this.map.set(hash, pool)
      this.evictOverCap(hash)
    }
    pool.lastUsedAt = Date.now()
    return pool
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer)
    for (const pool of this.map.values()) {
      await this.dispose(pool)
    }
    this.map.clear()
  }

  private async dispose(pool: P): Promise<void> {
    try {
      await this.opts.dispose?.(pool)
    } catch {
      // best-effort
    }
  }

  private sweep(): void {
    const cutoff = Date.now() - this.idleMs
    for (const [hash, pool] of this.map) {
      if (hash === DISABLED_HASH) continue // shared bucket holds no resources
      if (pool.lastUsedAt < cutoff) {
        this.map.delete(hash)
        void this.dispose(pool)
      }
    }
  }

  /** Evict least-recently-used pools until the cap holds, sparing `keep`. */
  private evictOverCap(keep: string): void {
    let size = this.map.size - (this.map.has(DISABLED_HASH) ? 1 : 0)
    while (size > this.maxEntries) {
      let lruHash: string | undefined
      let lruAt = Infinity
      for (const [hash, pool] of this.map) {
        if (hash === DISABLED_HASH || hash === keep) continue
        if (pool.lastUsedAt < lruAt) {
          lruAt = pool.lastUsedAt
          lruHash = hash
        }
      }
      if (lruHash === undefined) return
      const evicted = this.map.get(lruHash) as P
      this.map.delete(lruHash)
      void this.dispose(evicted)
      size--
    }
  }
}
