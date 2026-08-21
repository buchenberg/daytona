import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cron, CronExpression } from '@nestjs/schedule'
import { FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm'
import { WarmPool } from '../entities/warm-pool.entity'
import { Sandbox } from '../entities/sandbox.entity'
import { Snapshot } from '../entities/snapshot.entity'
import { Region } from '../../region/entities/region.entity'
import { SnapshotState } from '../enums/snapshot-state.enum'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SnapshotRepository } from '../repositories/snapshot.repository'
import { SnapshotService } from './snapshot.service'
import { SandboxRepository } from '../repositories/sandbox.repository'
import { SandboxService } from './sandbox.service'
import { SandboxWarmPoolService } from './sandbox-warm-pool.service'
import { OrganizationService } from '../../organization/services/organization.service'
import { RedisLockProvider } from '../common/redis-lock.provider'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { LogExecution } from '../../common/decorators/log-execution.decorator'
import { WithInstrumentation } from '../../common/decorators/otel.decorator'
import { getStateChangeLockKey } from '../utils/lock-key.util'
import { BadRequestError } from '../../exceptions/bad-request.exception'
import { CreateWarmPoolDto } from '../dto/create-warm-pool.dto'
import { UpdateWarmPoolDto } from '../dto/update-warm-pool.dto'
import { WarmPoolDto } from '../dto/warm-pool.dto'
import { isValidUuid } from '../../common/utils/uuid'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'

// Self-serve warm pool sandboxes are always created with this OS user, matching createForWarmPool.
const WARM_POOL_OS_USER = 'daytona'

@Injectable()
export class WarmPoolService {
  private readonly logger = new Logger(WarmPoolService.name)

  constructor(
    @InjectRepository(WarmPool)
    private readonly warmPoolRepository: Repository<WarmPool>,
    private readonly snapshotRepository: SnapshotRepository,
    private readonly snapshotService: SnapshotService,
    private readonly sandboxRepository: SandboxRepository,
    private readonly sandboxService: SandboxService,
    private readonly sandboxWarmPoolService: SandboxWarmPoolService,
    private readonly organizationService: OrganizationService,
    private readonly redisLockProvider: RedisLockProvider,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async create(organizationId: string, dto: CreateWarmPoolDto): Promise<WarmPoolDto> {
    const organization = await this.organizationService.findOne(organizationId)
    if (!organization) {
      throw new NotFoundException('Organization not found')
    }

    const region = await this.sandboxService.getValidatedOrDefaultRegion(organization, dto.target)
    const snapshot = await this.resolveSnapshot(organizationId, dto.snapshot)

    // GPU sandboxes are always ephemeral and never served from a warm pool, so a GPU pool would only
    // accumulate sandboxes that can never be claimed.
    if (snapshot.gpu > 0) {
      throw new BadRequestError('Warm pools are not supported for GPU snapshots')
    }

    if (!(await this.snapshotService.isAvailableInRegion(snapshot.id, region.id))) {
      throw new BadRequestError(`Snapshot ${dto.snapshot} is not available in region ${region.id}`)
    }

    await this.assertPoolFitsRegionQuota(organizationId, dto.pool, snapshot, region)

    const env: { [key: string]: string } = {}

    // The spec sandbox creation matches against; also serves as the per-organization uniqueness key.
    const spec = {
      organizationId,
      snapshot: snapshot.name,
      target: region.id,
      cpu: snapshot.cpu,
      mem: snapshot.mem,
      disk: snapshot.disk,
      gpu: snapshot.gpu,
      osUser: WARM_POOL_OS_USER,
      env,
    }

    const existing = await this.warmPoolRepository.findOne({ where: spec })
    if (existing) {
      throw new ConflictException('A warm pool for this snapshot and region already exists')
    }

    const warmPool = this.warmPoolRepository.create({
      ...spec,
      pool: dto.pool,
      gpuType: snapshot.gpuType ?? '',
    })
    try {
      const saved = await this.warmPoolRepository.save(warmPool)
      // Clear a cached claim miss so the new pool serves immediately; a failed DEL ages out via TTL.
      await this.redis.del(SandboxWarmPoolService.skipKey(organizationId, snapshot.id)).catch(() => undefined)
      return WarmPoolDto.from(saved, 0)
    } catch (error) {
      // The findOne check above is best-effort; a concurrent create can still race
      // past it and hit the (organizationId, snapshot, target) unique index.
      // Surface a 409 rather than a 500.
      if (error.code === '23505') {
        throw new ConflictException('A warm pool for this snapshot and region already exists')
      }
      throw error
    }
  }

  async findAll(organizationId: string): Promise<WarmPoolDto[]> {
    const warmPools = await this.warmPoolRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    })

    return Promise.all(
      warmPools.map(async (warmPool) =>
        WarmPoolDto.from(warmPool, await this.sandboxWarmPoolService.countPoolMembers(warmPool)),
      ),
    )
  }

  // Resizing only changes the target. The reconcile cron tops up when below it and trims when above
  // it (size 0 drains the pool entirely), so we never block the request on destroying sandboxes.
  async update(organizationId: string, id: string, dto: UpdateWarmPoolDto): Promise<WarmPoolDto> {
    const warmPool = await this.findOwnedOrFail(organizationId, id)

    const organization = await this.organizationService.findOne(organizationId)
    if (!organization) {
      throw new NotFoundException('Organization not found')
    }
    const region = await this.sandboxService.getValidatedOrDefaultRegion(organization, warmPool.target)
    const snapshot = await this.resolveSnapshot(organizationId, warmPool.snapshot)
    await this.assertPoolFitsRegionQuota(organizationId, dto.pool, snapshot, region)

    warmPool.pool = dto.pool
    const saved = await this.warmPoolRepository.save(warmPool)
    // A pool at size 0 misses claims and re-arms the skip cache; resizing back up must clear it.
    if (dto.pool > 0) {
      await this.redis.del(SandboxWarmPoolService.skipKey(organizationId, snapshot.id)).catch(() => undefined)
    }
    return WarmPoolDto.from(saved, await this.sandboxWarmPoolService.countPoolMembers(saved))
  }

  // Deleting only removes the config row. Its sandboxes are left orphaned and the reconcile cron
  // destroys them on its next tick.
  async remove(organizationId: string, id: string): Promise<void> {
    const warmPool = await this.findOwnedOrFail(organizationId, id)
    await this.warmPoolRepository.delete({ id: warmPool.id })
  }

  // Destroys self-serve warm sandboxes that the top-up cron cannot fix on its own: the surplus of a
  // pool that was shrunk (newest first) and sandboxes orphaned by a deleted pool. Global pools are
  // never trimmed here. Pairs with SandboxWarmPoolService.warmPoolCheck (top-up).
  @Cron(CronExpression.EVERY_MINUTE, { name: 'cleanup-warm-pool-sandboxes' })
  @LogExecution('cleanup-warm-pool-sandboxes')
  @WithInstrumentation()
  async cleanupWarmPoolSandboxes(): Promise<void> {
    const lockKey = 'sandbox:cleanup-warm-pool-sandboxes'
    if (!(await this.redisLockProvider.lock(lockKey, 300))) {
      return
    }

    try {
      const pools = await this.warmPoolRepository.find({ where: { organizationId: Not(IsNull()) } })

      for (const pool of pools) {
        // Drop a pool whose snapshot is gone or being removed, so a recreated snapshot with the
        // same name starts fresh. Its members become orphans, destroyed by the sweep below.
        if (pool.organizationId) {
          const servable = await this.snapshotRepository.findOne({
            where: [
              { organizationId: pool.organizationId, name: pool.snapshot, state: Not(SnapshotState.REMOVING) },
              { general: true, name: pool.snapshot, state: Not(SnapshotState.REMOVING) },
            ],
          })
          if (!servable) {
            await this.warmPoolRepository.delete({ id: pool.id })
            continue
          }
        }

        const members = await this.sandboxRepository.find({
          where: {
            organizationId: pool.organizationId ?? undefined,
            warmPoolId: pool.id,
            state: Not(In([SandboxState.DESTROYED, SandboxState.DESTROYING])),
          },
          order: { createdAt: 'DESC' },
        })

        // A warm member stays running until claimed; destroy any that drifted out of STARTED (e.g.
        // auto-stopped) so the fill cron replaces it with a fresh one.
        const ready: Sandbox[] = []
        for (const member of members) {
          if (member.desiredState === SandboxDesiredState.STARTED) ready.push(member)
          else await this.destroyMember(member)
        }

        // Trim members beyond the target (newest first).
        for (const member of ready.slice(pool.pool)) {
          await this.destroyMember(member)
        }
      }

      // Load candidates before pool ids so a pool created mid-run (always before its sandboxes) is
      // never mistaken for deleted; only genuinely dangling sandboxes remain.
      const candidates = await this.sandboxRepository.find({
        where: { warmPoolId: Not(IsNull()), desiredState: Not(SandboxDesiredState.DESTROYED) },
      })
      const livePoolIds = new Set((await this.warmPoolRepository.find({ select: ['id'] })).map((p) => p.id))
      for (const orphan of candidates) {
        if (!livePoolIds.has(orphan.warmPoolId)) {
          await this.destroyMember(orphan)
        }
      }
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  private async destroyMember(sandbox: Sandbox): Promise<void> {
    const lockKey = getStateChangeLockKey(sandbox.id)
    if (!(await this.redisLockProvider.lock(lockKey, 30))) {
      return
    }
    try {
      await this.sandboxService.destroy(sandbox.id, sandbox.organizationId)
    } catch (error) {
      this.logger.error(`Error destroying warm pool sandbox ${sandbox.id}:`, error)
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  // A pool larger than the organization's region quota could never fully fill; reject it up front.
  // The quota stays the live authority — the fill cron still validates each member creation.
  private async assertPoolFitsRegionQuota(
    organizationId: string,
    pool: number,
    snapshot: Snapshot,
    region: Region,
  ): Promise<void> {
    if (!region.enforceQuotas) {
      return
    }
    const quota = await this.organizationService.getRegionQuota(organizationId, region.id, snapshot.sandboxClass)
    if (!quota) {
      return
    }
    const cpuFits = pool * snapshot.cpu <= quota.totalCpuQuota
    const memFits = pool * snapshot.mem <= quota.totalMemoryQuota
    const diskFits = pool * snapshot.disk <= quota.totalDiskQuota
    if (!cpuFits || !memFits || !diskFits) {
      throw new BadRequestError(
        `Pool of ${pool} sandboxes needs ${pool * snapshot.cpu} vCPU / ${pool * snapshot.mem}GiB memory / ` +
          `${pool * snapshot.disk}GiB disk, exceeding the organization quota for region ${region.id} ` +
          `(${quota.totalCpuQuota} vCPU / ${quota.totalMemoryQuota}GiB / ${quota.totalDiskQuota}GiB)`,
      )
    }
  }

  private async findOwnedOrFail(organizationId: string, id: string): Promise<WarmPool> {
    const warmPool = await this.warmPoolRepository.findOne({ where: { id, organizationId } })
    if (!warmPool) {
      throw new NotFoundException('Warm pool not found')
    }
    return warmPool
  }

  private async resolveSnapshot(organizationId: string, snapshotIdOrName: string): Promise<Snapshot> {
    const filter: FindOptionsWhere<Snapshot>[] = [
      { organizationId, name: snapshotIdOrName },
      { general: true, name: snapshotIdOrName },
    ]
    if (isValidUuid(snapshotIdOrName)) {
      filter.push({ organizationId, id: snapshotIdOrName }, { general: true, id: snapshotIdOrName })
    }

    const snapshots = await this.snapshotRepository.find({ where: filter })
    if (snapshots.length === 0) {
      throw new BadRequestError(`Snapshot ${snapshotIdOrName} not found. Did you add it through the Daytona Dashboard?`)
    }

    // Deterministic precedence when an org snapshot shares a name with a general one: exact id > org-owned > general.
    const active = snapshots.filter((s) => s.state === SnapshotState.ACTIVE)
    const snapshot =
      active.find((s) => s.id === snapshotIdOrName) ??
      active.find((s) => s.organizationId === organizationId) ??
      active[0]
    if (!snapshot) {
      throw new BadRequestError(`Snapshot ${snapshotIdOrName} is not active`)
    }
    return snapshot
  }
}
