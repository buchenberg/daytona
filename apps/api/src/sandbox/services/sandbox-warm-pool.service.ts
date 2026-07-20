import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cron, CronExpression } from '@nestjs/schedule'
import { FindOptionsWhere, In, IsNull, MoreThan, Not, Repository } from 'typeorm'
import { RedisLockProvider } from '../common/redis-lock.provider'
import { SandboxRepository } from '../repositories/sandbox.repository'
import { Sandbox } from '../entities/sandbox.entity'
import { SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION } from '../constants/sandbox.constants'
import { WarmPool } from '../entities/warm-pool.entity'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { SandboxEvents } from '../constants/sandbox-events.constants'
import { SandboxOrganizationUpdatedEvent } from '../events/sandbox-organization-updated.event'
import { ConfigService } from '@nestjs/config'
import { Snapshot } from '../entities/snapshot.entity'
import { SnapshotState } from '../enums/snapshot-state.enum'
import { SnapshotRepository } from '../repositories/snapshot.repository'
import { BadRequestError } from '../../exceptions/bad-request.exception'
import { SandboxState } from '../enums/sandbox-state.enum'
import { Runner } from '../entities/runner.entity'
import { WarmPoolTopUpRequested } from '../events/warmpool-topup-requested.event'
import { WarmPoolEvents } from '../constants/warmpool-events.constants'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { isValidUuid } from '../../common/utils/uuid'
import { LogExecution } from '../../common/decorators/log-execution.decorator'
import { WithInstrumentation } from '../../common/decorators/otel.decorator'

export type FetchWarmPoolSandboxParams = {
  snapshot: string | Snapshot
  target: string
  cpu: number
  mem: number
  disk: number
  gpu: number
  osUser: string
  env: { [key: string]: string }
  organizationId: string
  state: string
}

@Injectable()
export class SandboxWarmPoolService {
  private readonly logger = new Logger(SandboxWarmPoolService.name)

  constructor(
    @InjectRepository(WarmPool)
    private readonly warmPoolRepository: Repository<WarmPool>,
    private readonly sandboxRepository: SandboxRepository,
    private readonly snapshotRepository: SnapshotRepository,
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
    private readonly redisLockProvider: RedisLockProvider,
    private readonly configService: ConfigService,
    @Inject(EventEmitter2)
    private eventEmitter: EventEmitter2,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  static skipKey(organizationId: string, snapshotId: string): string {
    return `warm-pool:skip:${organizationId}:${snapshotId}`
  }

  async fetchWarmPoolSandbox(params: FetchWarmPoolSandboxParams): Promise<Sandbox | null> {
    //  validate snapshot
    let snapshot: Snapshot | null = null
    if (typeof params.snapshot === 'string') {
      const sandboxSnapshot = params.snapshot || this.configService.get<string>('DEFAULT_SNAPSHOT')

      const snapshotFilter: FindOptionsWhere<Snapshot>[] = [
        { organizationId: params.organizationId, name: sandboxSnapshot, state: SnapshotState.ACTIVE },
        { general: true, name: sandboxSnapshot, state: SnapshotState.ACTIVE },
      ]

      if (isValidUuid(sandboxSnapshot)) {
        snapshotFilter.push(
          { organizationId: params.organizationId, id: sandboxSnapshot, state: SnapshotState.ACTIVE },
          { general: true, id: sandboxSnapshot, state: SnapshotState.ACTIVE },
        )
      }

      snapshot = await this.snapshotRepository.findOne({
        where: snapshotFilter,
      })
      if (!snapshot) {
        throw new BadRequestError(
          `Snapshot ${sandboxSnapshot} not found. Did you add it through the Daytona Dashboard?`,
        )
      }
    } else {
      snapshot = params.snapshot
    }

    //  Prefer the requesting organization's own self-serve warm pool, then fall back to a global pool.
    const warmPoolMatch = {
      snapshot: snapshot.name,
      target: params.target,
      cpu: params.cpu,
      mem: params.mem,
      disk: params.disk,
      gpu: params.gpu,
      osUser: params.osUser,
      env: params.env,
      pool: MoreThan(0),
    }
    const warmPoolItem =
      (await this.warmPoolRepository.findOne({
        where: { ...warmPoolMatch, organizationId: params.organizationId },
      })) ??
      (await this.warmPoolRepository.findOne({
        where: { ...warmPoolMatch, organizationId: IsNull() },
      }))

    if (warmPoolItem) {
      // Self-serve pool sandboxes live under the real organization and link back via warmPoolId;
      // global pool sandboxes live under the sentinel organization with no pool link.
      const selfServe = !!warmPoolItem.organizationId
      const candidateOrganizationId = selfServe ? params.organizationId : SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION

      const availabilityScoreThreshold = this.configService.getOrThrow<number>('runnerScore.thresholds.availability')

      // Build subquery to find excluded runners (unschedulable OR low score)
      const excludedRunnersSubquery = this.runnerRepository
        .createQueryBuilder('runner')
        .select('runner.id')
        .where('runner.region = :region')
        .andWhere('(runner.unschedulable = true OR runner.availabilityScore < :scoreThreshold)')

      const queryBuilder = this.sandboxRepository
        .createQueryBuilder('sandbox')
        .where('sandbox.cpu = :cpu', { cpu: warmPoolItem.cpu })
        .andWhere('sandbox.mem = :mem', { mem: warmPoolItem.mem })
        .andWhere('sandbox.disk = :disk', { disk: warmPoolItem.disk })
        .andWhere('sandbox.snapshot = :snapshot', { snapshot: snapshot.name })
        .andWhere('sandbox.osUser = :osUser', { osUser: warmPoolItem.osUser })
        .andWhere('sandbox.env = :env', { env: warmPoolItem.env })
        .andWhere('sandbox.organizationId = :organizationId', { organizationId: candidateOrganizationId })
        .andWhere(
          selfServe ? 'sandbox."warmPoolId" = :warmPoolId' : 'sandbox."warmPoolId" IS NULL',
          selfServe ? { warmPoolId: warmPoolItem.id } : {},
        )
        .andWhere('sandbox.region = :region', { region: warmPoolItem.target })
        .andWhere('sandbox.state = :state', { state: SandboxState.STARTED })
        .andWhere(`sandbox.runnerId NOT IN (${excludedRunnersSubquery.getQuery()})`)
        .setParameters({
          region: warmPoolItem.target,
          scoreThreshold: availabilityScoreThreshold,
        })

      const candidateLimit = this.configService.getOrThrow<number>('warmPool.candidateLimit')
      const warmPoolSandboxes = await queryBuilder.orderBy('RANDOM()').take(candidateLimit).getMany()

      //  make sure we only release warm pool sandbox once
      let warmPoolSandbox: Sandbox | null = null
      for (const sandbox of warmPoolSandboxes) {
        const lockKey = `sandbox-warm-pool-${sandbox.id}`
        if (!(await this.redisLockProvider.lock(lockKey, 10))) {
          continue
        }

        warmPoolSandbox = sandbox
        break
      }

      return warmPoolSandbox
    }
    // Cache the miss so creates skip the pool lookup; pool create/resize clears the key, the TTL
    // covers out-of-band changes.
    await this.redis.set(SandboxWarmPoolService.skipKey(params.organizationId, snapshot.id), '1', 'EX', 60)
    return null
  }

  async countPoolMembers(warmPoolItem: WarmPool): Promise<number> {
    return this.sandboxRepository.count({ where: this.poolMemberCountWhere(warmPoolItem) })
  }

  // The single definition of a warm pool's members, shared by top-up, trimming and the displayed
  // pool size. Self-serve pools are matched by warmPoolId under the owning organization; global
  // pools are matched by spec under the sentinel organization. Pass `errored` to match the failed
  // members instead of the live ones.
  poolMemberCountWhere(warmPoolItem: WarmPool, errored = false): FindOptionsWhere<Sandbox> {
    const activeStates: Pick<FindOptionsWhere<Sandbox>, 'desiredState' | 'state'> = errored
      ? { state: In([SandboxState.ERROR, SandboxState.BUILD_FAILED]) }
      : {
          desiredState: SandboxDesiredState.STARTED,
          // Exclude terminal/teardown states so destroyed-but-not-yet-reaped rows don't inflate the
          // count (they're hidden from the sandbox list, which would otherwise disagree).
          state: Not(
            In([SandboxState.ERROR, SandboxState.BUILD_FAILED, SandboxState.DESTROYED, SandboxState.DESTROYING]),
          ),
        }
    if (warmPoolItem.organizationId) {
      return {
        organizationId: warmPoolItem.organizationId,
        warmPoolId: warmPoolItem.id,
        ...activeStates,
      }
    }
    return {
      snapshot: warmPoolItem.snapshot,
      organizationId: SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION,
      osUser: warmPoolItem.osUser,
      env: warmPoolItem.env,
      region: warmPoolItem.target,
      cpu: warmPoolItem.cpu,
      gpu: warmPoolItem.gpu,
      mem: warmPoolItem.mem,
      disk: warmPoolItem.disk,
      ...activeStates,
    }
  }

  //  todo: make frequency configurable or more efficient
  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'warm-pool-check' })
  @LogExecution('warm-pool-check')
  @WithInstrumentation()
  async warmPoolCheck(): Promise<void> {
    const warmPoolItems = await this.warmPoolRepository.find()

    await Promise.all(
      warmPoolItems.map(async (warmPoolItem) => {
        const lockKey = `warm-pool-lock-${warmPoolItem.id}`
        if (!(await this.redisLockProvider.lock(lockKey, 720))) {
          return
        }

        try {
          const sandboxCount = await this.sandboxRepository.count({
            where: this.poolMemberCountWhere(warmPoolItem),
          })
          const erroredCount = await this.sandboxRepository.count({
            where: this.poolMemberCountWhere(warmPoolItem, true),
          })

          // Errored members count against the pool budget, so a persistent snapshot/runner failure
          // can't make the cron respawn failed sandboxes without bound: total (live + errored) never
          // exceeds the target.
          const missingCount = warmPoolItem.pool - sandboxCount - erroredCount
          if (missingCount > 0) {
            // Top-ups are guaranteed to fail while the snapshot is not active — skip them and
            // surface the reason instead. Same snapshot filter as createForWarmPool.
            const activeSnapshot = await this.snapshotRepository.findOne({
              where: [
                {
                  organizationId: warmPoolItem.organizationId ?? SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION,
                  name: warmPoolItem.snapshot,
                  state: SnapshotState.ACTIVE,
                },
                { general: true, name: warmPoolItem.snapshot, state: SnapshotState.ACTIVE },
              ],
            })
            if (!activeSnapshot) {
              const errorReason = `Snapshot ${warmPoolItem.snapshot} is not active`
              if (warmPoolItem.organizationId && warmPoolItem.errorReason !== errorReason) {
                await this.warmPoolRepository.update(warmPoolItem.id, { errorReason })
              }
              return
            }

            // Fill gradually: bounds the per-tick burst of a freshly created pool, and of a pool
            // stuck above quota (quota-failed creates never become ERROR members, so missingCount
            // stays high and would retry in full every tick).
            const maxTopUpsPerTick = this.configService.getOrThrow<number>('warmPool.maxTopUpsPerTick')
            const createCount = Math.min(missingCount, maxTopUpsPerTick)
            const promises = []
            this.logger.debug(`Creating ${createCount}/${missingCount} sandboxes for warm pool id ${warmPoolItem.id}`)

            for (let i = 0; i < createCount; i++) {
              promises.push(
                this.eventEmitter.emitAsync(WarmPoolEvents.TOPUP_REQUESTED, new WarmPoolTopUpRequested(warmPoolItem)),
              )
            }

            // Wait for all promises to settle before releasing the lock. Otherwise, another worker could start creating sandboxes
            await Promise.allSettled(promises)
          }
        } finally {
          await this.redisLockProvider.unlock(lockKey)
        }
      }),
    )
  }

  @OnEvent(SandboxEvents.ORGANIZATION_UPDATED)
  async handleSandboxOrganizationUpdated(event: SandboxOrganizationUpdatedEvent) {
    if (event.newOrganizationId === SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION) {
      return
    }
    // Only the global pool refills on an organization swap; self-serve pools are kept topped up by
    // the cron and never change their sandboxes' organization on claim.
    const warmPoolItem = await this.warmPoolRepository.findOne({
      where: {
        organizationId: IsNull(),
        snapshot: event.sandbox.snapshot,
        cpu: event.sandbox.cpu,
        mem: event.sandbox.mem,
        disk: event.sandbox.disk,
        target: event.sandbox.region,
        env: event.sandbox.env,
        gpu: event.sandbox.gpu,
        osUser: event.sandbox.osUser,
      },
    })

    if (!warmPoolItem) {
      return
    }

    const sandboxCount = await this.sandboxRepository.count({
      where: this.poolMemberCountWhere(warmPoolItem),
    })

    if (warmPoolItem.pool <= sandboxCount) {
      return
    }

    if (warmPoolItem) {
      this.eventEmitter.emit(WarmPoolEvents.TOPUP_REQUESTED, new WarmPoolTopUpRequested(warmPoolItem))
    }
  }
}
