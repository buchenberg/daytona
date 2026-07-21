import { Injectable, Logger } from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, IsNull, Raw } from 'typeorm'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisLockProvider } from '../common/redis-lock.provider'
import { SandboxLastActivity } from '../entities/sandbox-last-activity.entity'
import { LogExecution } from '../../common/decorators/log-execution.decorator'
import { WithInstrumentation } from '../../common/decorators/otel.decorator'
import { TypedConfigService } from '../../config/typed-config.service'
import { SandboxActivitySource, isSandboxActivitySource } from '../common/sandbox-activity-source'

const REDIS_ACTIVITY_KEY = 'sandbox:activity'
const REDIS_ACTIVITY_SOURCE_PREFIX = 'sandbox:activity:source:'
// Kept comfortably longer than the flush interval so a pending timestamp's source is never lost before
// it is flushed; keys for destroyed sandboxes self-expire without any explicit cleanup.
const ACTIVITY_SOURCE_TTL_SECONDS = 300

interface SandboxActivityUpdate {
  sandboxId: string
  lastActivityAt: Date
  lastActivitySource: SandboxActivitySource | null
}

@Injectable()
export class SandboxActivityService {
  private readonly logger = new Logger(SandboxActivityService.name)

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisLockProvider: RedisLockProvider,
    private readonly configService: TypedConfigService,
  ) {}

  /**
   * Buffers a last activity timestamp in Redis (throttled to once per configured throttle TTL).
   *
   * The timestamp and its source are written atomically: a `source` is stored under a short-lived
   * per-sandbox key, and a source-less touch clears any previously buffered source so it cannot later be
   * misattributed to this newer timestamp.
   *
   * Relies on the periodic flush to the database.
   */
  async updateLastActivityAt(sandboxId: string, lastActivityAt: Date, source?: SandboxActivitySource): Promise<void> {
    const lockKey = `sandbox:update-last-activity:${sandboxId}`
    const acquired = await this.redisLockProvider.lock(
      lockKey,
      this.configService.getOrThrow('sandboxActivity.throttleTtlSeconds'),
    )
    if (!acquired) {
      return
    }
    const sourceKey = `${REDIS_ACTIVITY_SOURCE_PREFIX}${sandboxId}`
    const tx = this.redis.multi().zadd(REDIS_ACTIVITY_KEY, lastActivityAt.getTime(), sandboxId)
    if (source) {
      tx.set(sourceKey, source, 'EX', ACTIVITY_SOURCE_TTL_SECONDS)
    } else {
      tx.del(sourceKey)
    }
    await tx.exec()
  }

  /**
   * Read the last activity timestamp for a sandbox.
   *
   * Checks Redis buffer first, falls back to the database.
   */
  async getLastActivityAt(sandboxId: string): Promise<Date | null> {
    const score = await this.redis.zscore(REDIS_ACTIVITY_KEY, sandboxId)
    if (score !== null) {
      return new Date(Number(score))
    }

    const row = await this.dataSource.getRepository(SandboxLastActivity).findOne({ where: { sandboxId } })

    return row?.lastActivityAt ?? null
  }

  /**
   * Flush buffered activity timestamps from Redis to the database in bulk.
   * Processes entries in batches to avoid oversized transactions.
   *
   * Frequency must be < 1min to prevent unintended auto-lifecycle actions.
   */
  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'flush-activity-to-db' })
  @LogExecution('flush-activity-to-db')
  @WithInstrumentation()
  async flushActivityToDb(): Promise<void> {
    const lockKey = 'flush-activity-to-db-lock'
    const lockTtl = 30
    const acquired = await this.redisLockProvider.lock(lockKey, lockTtl)
    if (!acquired) {
      return
    }

    try {
      let totalFlushed = 0

      const batchSize = this.configService.getOrThrow('sandboxActivity.flushBatchSize')
      const maxScore = Date.now()

      const entries = await this.redis.zrangebyscore(REDIS_ACTIVITY_KEY, '-inf', maxScore, 'WITHSCORES')

      if (entries.length === 0) {
        return
      }

      const timestamps: Array<Pick<SandboxActivityUpdate, 'sandboxId' | 'lastActivityAt'>> = []
      for (let i = 0; i < entries.length; i += 2) {
        timestamps.push({
          sandboxId: entries[i],
          lastActivityAt: new Date(Number(entries[i + 1])),
        })
      }

      const updates = await this.attachActivitySources(timestamps)

      for (let offset = 0; offset < updates.length; offset += batchSize) {
        const batch = updates.slice(offset, offset + batchSize)
        await this.bulkUpsertActivity(batch)
        totalFlushed += batch.length
      }

      await this.redis.zremrangebyscore(REDIS_ACTIVITY_KEY, '-inf', maxScore)

      if (totalFlushed > 0) {
        this.logger.debug(`Flushed ${totalFlushed} activity timestamps to the database`)
      }
    } catch (error) {
      this.logger.error('Error flushing activity timestamps to the database:', error)
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  /**
   * Resolves each buffered timestamp's source from Redis.
   *
   * A missing or unrecognized value resolves to `null` so the flush unsets the stored source rather
   * than leaving a stale one attached to the newer timestamp.
   */
  private async attachActivitySources(
    timestamps: Array<Pick<SandboxActivityUpdate, 'sandboxId' | 'lastActivityAt'>>,
  ): Promise<SandboxActivityUpdate[]> {
    if (timestamps.length === 0) {
      return []
    }

    const sourceKeys = timestamps.map((timestamp) => `${REDIS_ACTIVITY_SOURCE_PREFIX}${timestamp.sandboxId}`)
    const sources = await this.redis.mget(sourceKeys)

    return timestamps.map((timestamp, index) => {
      const source = sources[index]
      return {
        ...timestamp,
        lastActivitySource: source && isSandboxActivitySource(source) ? source : null,
      }
    })
  }

  /**
   * Builds a query to upsert activity timestamps into the database.
   *
   * The advance-only guard writes the row only when the incoming timestamp is newer, and
   * `lastActivitySource` always moves with it — including being unset to null when the buffered source is
   * missing, so a newer timestamp never keeps a stale source.
   */
  private buildUpsertQuery(values: SandboxActivityUpdate[]) {
    return this.dataSource
      .createQueryBuilder()
      .insert()
      .into(SandboxLastActivity)
      .values(values)
      .orUpdate(['lastActivityAt', 'lastActivitySource'], ['sandboxId'], {
        overwriteCondition: {
          where: [
            { lastActivityAt: IsNull() },
            { lastActivityAt: Raw((alias) => `${alias} < EXCLUDED."lastActivityAt"`) },
          ],
        },
      })
  }

  /**
   * Bulk upserts activity timestamps into the database.
   *
   * In case of FK violations, falls back to individual upserts to skip deleted sandbox(es).
   */
  private async bulkUpsertActivity(updates: SandboxActivityUpdate[]): Promise<void> {
    if (updates.length === 0) {
      this.logger.debug('No activity updates to flush')
      return
    }

    try {
      await this.buildUpsertQuery(updates).execute()
    } catch (bulkUpsertError) {
      if (bulkUpsertError.code === '23503') {
        this.logger.warn(
          'Bulk upsert for activity timestamps failed with FK violation, falling back to individual upserts',
        )
        for (const update of updates) {
          try {
            await this.buildUpsertQuery([update]).execute()
          } catch (error) {
            if (error.code === '23503') {
              this.logger.warn(`Skipping activity flush for sandbox ${update.sandboxId} (deleted)`)
            } else {
              throw error
            }
          }
        }
      } else {
        throw bulkUpsertError
      }
    }
  }
}
