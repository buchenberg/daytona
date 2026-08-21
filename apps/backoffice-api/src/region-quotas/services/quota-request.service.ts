import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { Organization } from '@api/organization/entities/organization.entity'
import { Region } from '@api/region/entities/region.entity'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { QuotaRequest, QuotaRequestStatus, QuotaRequestKind } from '../../backoffice-db/entities/quota-request.entity'
import { updateWithPreconditions } from '../../common/preconditions.util'
import { config } from '../../config/env'
import { UpdateQuotaRequestDto, CreateQuotaRequestDto } from '../dto'
import { QuotaAmounts, validateDailyBudget, validatePercentCap } from './quota-update-policy.util'

export interface RequestActor {
  id: string
  email: string
}

export interface UpdateLimits {
  maxPercent: number
}

export interface UpdateBudget {
  budget: QuotaAmounts
  spent: QuotaAmounts
  remaining: QuotaAmounts
  limits: UpdateLimits
}

// Rolling window the per-editor daily budgets are measured over.
const BUDGET_WINDOW_HOURS = 24

// Support can request quota creation for container only, for now. The other
// classes (linux-vm, windows, android) need capacity planning before
// self-service creates — extend this list to enable them.
const CREATABLE_SANDBOX_CLASSES = [SandboxClass.CONTAINER]

const pendingRequestConflict = (organizationId: string, regionId: string, sandboxClass: SandboxClass) =>
  new ConflictException(
    `A pending request already exists for organization ${organizationId}, region ${regionId} and ` +
      `sandbox class ${sandboxClass}. Approve, reject, or cancel it before creating another.`,
  )

@Injectable()
export class QuotaRequestService {
  private readonly logger = new Logger(QuotaRequestService.name)

  constructor(
    @InjectRepository(RegionQuota)
    private readonly regionQuotaRepository: Repository<RegionQuota>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(QuotaRequest, 'backoffice')
    private readonly requestRepository: Repository<QuotaRequest>,
  ) {}

  private get updateBudget(): QuotaAmounts {
    return {
      cpu: config.regionQuotas.updateDailyBudgetCpu,
      memory: config.regionQuotas.updateDailyBudgetMemory,
      disk: config.regionQuotas.updateDailyBudgetDisk,
      gpu: config.regionQuotas.updateDailyBudgetGpu,
    }
  }

  private get createBudget(): QuotaAmounts {
    return {
      cpu: config.regionQuotas.createDailyBudgetCpu,
      memory: config.regionQuotas.createDailyBudgetMemory,
      disk: config.regionQuotas.createDailyBudgetDisk,
      gpu: config.regionQuotas.createDailyBudgetGpu,
    }
  }

  /** Limits a create request grants. Static config — safe to serve without auth-specific state. */
  get createLimits(): QuotaAmounts {
    return {
      cpu: config.regionQuotas.createLimitCpu,
      memory: config.regionQuotas.createLimitMemory,
      disk: config.regionQuotas.createLimitDisk,
      gpu: config.regionQuotas.createLimitGpu,
    }
  }

  /**
   * Apply a temporary, rate-limited increase to a region quota and record it as
   * PENDING so it can be approved (made permanent) or auto-reverted at expiry.
   */
  async requestUpdate(actor: RequestActor, dto: UpdateQuotaRequestDto): Promise<QuotaRequest> {
    const sandboxClass = dto.sandboxClass ?? SandboxClass.CONTAINER
    const deltas: QuotaAmounts = {
      cpu: dto.cpuDelta ?? 0,
      memory: dto.memoryDelta ?? 0,
      disk: dto.diskDelta ?? 0,
      gpu: dto.gpuDelta ?? 0,
    }

    if (Object.values(deltas).every((delta) => delta <= 0)) {
      throw new BadRequestException('At least one delta must be greater than zero')
    }

    const quota = await this.regionQuotaRepository.findOne({
      where: { organizationId: dto.organizationId, regionId: dto.regionId, sandboxClass },
    })
    if (!quota) {
      throw new NotFoundException(
        `Region quota not found for organization ${dto.organizationId}, region ${dto.regionId} and sandbox class ${sandboxClass}. ` +
          `Create it first — via a create request or a full quota editor — before requesting an update.`,
      )
    }

    await this.assertNoPendingRequest(dto.organizationId, dto.regionId, sandboxClass)

    const current: QuotaAmounts = {
      cpu: quota.totalCpuQuota,
      memory: quota.totalMemoryQuota,
      disk: quota.totalDiskQuota,
      gpu: quota.totalGpuQuota,
    }

    const percentViolations = validatePercentCap(current, deltas, config.regionQuotas.updateMaxIncreasePercent)
    if (percentViolations.length) {
      throw new ForbiddenException({ message: percentViolations })
    }

    const spent = await this.spentInWindow(actor.id, QuotaRequestKind.UPDATE)
    const budgetViolations = validateDailyBudget(spent, deltas, this.updateBudget)
    if (budgetViolations.length) {
      throw new ForbiddenException({ message: budgetViolations })
    }

    const after: QuotaAmounts = {
      cpu: current.cpu + deltas.cpu,
      memory: current.memory + deltas.memory,
      disk: current.disk + deltas.disk,
      gpu: current.gpu + deltas.gpu,
    }

    // Apply immediately; preconditions guarantee no concurrent edit slipped in.
    await updateWithPreconditions(
      this.regionQuotaRepository,
      { organizationId: dto.organizationId, regionId: dto.regionId, sandboxClass },
      {
        totalCpuQuota: after.cpu,
        totalMemoryQuota: after.memory,
        totalDiskQuota: after.disk,
        totalGpuQuota: after.gpu,
      },
      {
        totalCpuQuota: current.cpu,
        totalMemoryQuota: current.memory,
        totalDiskQuota: current.disk,
        totalGpuQuota: current.gpu,
      },
    )

    const expiresAt = new Date(Date.now() + config.regionQuotas.requestTtlHours * 60 * 60 * 1000)

    const request = this.requestRepository.create({
      kind: QuotaRequestKind.UPDATE,
      organizationId: dto.organizationId,
      regionId: dto.regionId,
      sandboxClass,
      requestedById: actor.id,
      requestedByEmail: actor.email,
      cpuDelta: deltas.cpu,
      memoryDelta: deltas.memory,
      diskDelta: deltas.disk,
      gpuDelta: deltas.gpu,
      cpuBefore: current.cpu,
      memoryBefore: current.memory,
      diskBefore: current.disk,
      gpuBefore: current.gpu,
      cpuAfter: after.cpu,
      memoryAfter: after.memory,
      diskAfter: after.disk,
      gpuAfter: after.gpu,
      status: QuotaRequestStatus.PENDING,
      reason: dto.reason ?? null,
      expiresAt,
    })

    return this.saveOrRollback(request)
  }

  /**
   * Create a region quota with the configured default limits and record it as
   * PENDING so it can be approved (kept) or auto-deleted at expiry. Bounded by
   * a per-editor rolling daily create budget, like updates.
   */
  async requestCreate(actor: RequestActor, dto: CreateQuotaRequestDto): Promise<QuotaRequest> {
    const sandboxClass = dto.sandboxClass ?? SandboxClass.CONTAINER
    if (!CREATABLE_SANDBOX_CLASSES.includes(sandboxClass)) {
      throw new BadRequestException(
        `Quota creation for sandbox class ${sandboxClass} is not available via requests yet. ` +
          `Ask a full quota editor to create it.`,
      )
    }

    const [organizationExists, regionExists] = await Promise.all([
      this.organizationRepository.exists({ where: { id: dto.organizationId } }),
      this.regionRepository.exists({ where: { id: dto.regionId } }),
    ])
    if (!organizationExists) {
      throw new NotFoundException(`Organization ${dto.organizationId} not found`)
    }
    if (!regionExists) {
      throw new NotFoundException(`Region ${dto.regionId} not found`)
    }

    await this.assertNoPendingRequest(dto.organizationId, dto.regionId, sandboxClass)

    const limits = this.createLimits
    const spent = await this.spentInWindow(actor.id, QuotaRequestKind.CREATE)
    const budgetViolations = validateDailyBudget(spent, limits, this.createBudget)
    if (budgetViolations.length) {
      throw new ForbiddenException({ message: budgetViolations })
    }

    try {
      await this.regionQuotaRepository.insert(
        new RegionQuota({
          organizationId: dto.organizationId,
          regionId: dto.regionId,
          sandboxClass,
          totalCpuQuota: limits.cpu,
          totalMemoryQuota: limits.memory,
          totalDiskQuota: limits.disk,
          totalGpuQuota: limits.gpu,
        }),
      )
    } catch (error) {
      // Primary key violation — the quota already exists.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          `Region quota already exists for organization ${dto.organizationId}, region ${dto.regionId} and ` +
            `sandbox class ${sandboxClass}. Request an update instead.`,
        )
      }
      throw error
    }

    const request = this.requestRepository.create({
      kind: QuotaRequestKind.CREATE,
      organizationId: dto.organizationId,
      regionId: dto.regionId,
      sandboxClass,
      requestedById: actor.id,
      requestedByEmail: actor.email,
      cpuDelta: limits.cpu,
      memoryDelta: limits.memory,
      diskDelta: limits.disk,
      gpuDelta: limits.gpu,
      cpuBefore: 0,
      memoryBefore: 0,
      diskBefore: 0,
      gpuBefore: 0,
      cpuAfter: limits.cpu,
      memoryAfter: limits.memory,
      diskAfter: limits.disk,
      gpuAfter: limits.gpu,
      status: QuotaRequestStatus.PENDING,
      reason: dto.reason ?? null,
      expiresAt: new Date(Date.now() + config.regionQuotas.requestTtlHours * 60 * 60 * 1000),
    })

    return this.saveOrRollback(request)
  }

  /**
   * One active request per region_quota: a pending request must be approved,
   * rejected, expired, or cancelled by its requester before another can be
   * applied. This keeps the snapshot-based revert unambiguous (no stacking).
   */
  private async assertNoPendingRequest(
    organizationId: string,
    regionId: string,
    sandboxClass: SandboxClass,
  ): Promise<void> {
    const pending = await this.requestRepository.exists({
      where: { organizationId, regionId, sandboxClass, status: QuotaRequestStatus.PENDING },
    })
    if (pending) {
      throw pendingRequestConflict(organizationId, regionId, sandboxClass)
    }
  }

  /**
   * Persist the tracking row for a grant that was already applied to
   * region_quota. On failure, undo the grant (via the same kind-aware revert
   * used by the lifecycle) so we never leave a permanent, untracked grant that
   * no operator can see or expire — the two DBs share no transaction. A 23505
   * means we lost the race against another pending request on the same key
   * (partial unique index); surface the same conflict as the pre-check.
   */
  private async saveOrRollback(request: QuotaRequest): Promise<QuotaRequest> {
    try {
      return await this.requestRepository.save(request)
    } catch (error) {
      await this.revertQuota(request).catch((revertError) =>
        this.logger.error(
          `Failed to roll back quota for org ${request.organizationId}, region ${request.regionId}, ` +
            `class ${request.sandboxClass} after request persistence error: ${(revertError as Error).message}`,
        ),
      )
      if ((error as { code?: string }).code === '23505') {
        throw pendingRequestConflict(request.organizationId, request.regionId, request.sandboxClass)
      }
      throw error
    }
  }

  /** Make a pending request permanent. Requires regionQuotas:write (enforced at the controller). */
  async approve(actor: RequestActor, id: string): Promise<QuotaRequest> {
    await this.claimPending(id, QuotaRequestStatus.APPROVED, actor)
    return this.getOrThrow(id)
  }

  /** Reject a pending request and revert the quota immediately. */
  async reject(actor: RequestActor, id: string, reason?: string): Promise<QuotaRequest> {
    const request = await this.claimPending(id, QuotaRequestStatus.REJECTED, actor)
    // If a full editor changed the quota meanwhile, the revert is skipped and the request
    // is marked superseded rather than rejected.
    const reverted = await this.revertOrUnclaim(request)
    const patch: Partial<QuotaRequest> = {}
    if (!reverted) patch.status = QuotaRequestStatus.SUPERSEDED
    if (reason) patch.reason = request.reason ? `${request.reason}\n\nRejected: ${reason}` : `Rejected: ${reason}`
    if (Object.keys(patch).length) await this.requestRepository.update({ id }, patch)
    return this.getOrThrow(id)
  }

  /** Cancel a pending request and revert the quota. Only the original requester may cancel. */
  async cancel(actor: RequestActor, id: string): Promise<QuotaRequest> {
    const request = await this.getOrThrow(id)
    if (request.requestedById !== actor.id) {
      throw new ForbiddenException('You can only cancel quota requests you requested')
    }
    // Atomic claim guarded by requester so concurrent decisions can't double-act.
    const claim = await this.requestRepository.update(
      { id, status: QuotaRequestStatus.PENDING, requestedById: actor.id },
      {
        status: QuotaRequestStatus.CANCELLED,
        decidedById: actor.id,
        decidedByEmail: actor.email,
        decidedAt: new Date(),
      },
    )
    if (claim.affected === 0) {
      throw new BadRequestException(`Quota request ${id} is no longer pending`)
    }
    // If a full editor changed the quota meanwhile, skip the revert (their edit wins).
    const reverted = await this.revertOrUnclaim(request)
    if (!reverted) {
      await this.requestRepository.update({ id }, { status: QuotaRequestStatus.SUPERSEDED })
    }
    return this.getOrThrow(id)
  }

  /** Pending requests awaiting a decision — feeds the approvals/notifications tab. */
  async listPending(page = 1, pageSize = 25): Promise<{ items: QuotaRequest[]; total: number }> {
    const [items, total] = await this.requestRepository.findAndCount({
      where: { status: QuotaRequestStatus.PENDING },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return { items, total }
  }

  /** An editor's daily update budget, what they've spent in the window, and what remains. */
  async getRemainingBudget(actorId: string): Promise<UpdateBudget> {
    const budget = this.updateBudget
    const spent = await this.spentInWindow(actorId, QuotaRequestKind.UPDATE)
    return {
      budget,
      spent,
      remaining: {
        cpu: Math.max(0, budget.cpu - spent.cpu),
        memory: Math.max(0, budget.memory - spent.memory),
        disk: Math.max(0, budget.disk - spent.disk),
        gpu: Math.max(0, budget.gpu - spent.gpu),
      },
      limits: { maxPercent: config.regionQuotas.updateMaxIncreasePercent },
    }
  }

  /**
   * Atomically revert a request's increase on region_quota. Only reverts if the
   * current totals still match what this request set (`*After`); if a full editor
   * changed them in the meantime the precondition fails and we skip the revert,
   * letting the deliberate edit stand. Returns whether the revert was applied.
   */
  async revertQuota(request: QuotaRequest): Promise<boolean> {
    if (request.kind === QuotaRequestKind.CREATE) {
      const deleted = await this.deleteCreatedQuotaIfUnchanged(request)
      if (!deleted) {
        this.logger.warn(`Skipped delete of quota-create request ${request.id}: quota changed or already gone`)
      }
      return deleted
    }
    try {
      await updateWithPreconditions(
        this.regionQuotaRepository,
        { organizationId: request.organizationId, regionId: request.regionId, sandboxClass: request.sandboxClass },
        {
          totalCpuQuota: request.cpuBefore,
          totalMemoryQuota: request.memoryBefore,
          totalDiskQuota: request.diskBefore,
          totalGpuQuota: request.gpuBefore,
        },
        {
          totalCpuQuota: request.cpuAfter,
          totalMemoryQuota: request.memoryAfter,
          totalDiskQuota: request.diskAfter,
          totalGpuQuota: request.gpuAfter,
        },
      )
      return true
    } catch (error) {
      // Precondition mismatch (quota deliberately changed) or row gone — leave the quota as-is.
      if (error instanceof ConflictException || (error as Error).message === 'Entity not found') {
        this.logger.warn(`Skipped revert of request ${request.id}: ${(error as Error).message}`)
        return false
      }
      // Transient failure — propagate so the caller can release its claim and retry.
      throw error
    }
  }

  /**
   * Delete the region quota a CREATE request created — but only if the row is
   * untouched since creation (updatedAt still equals createdAt), so a later
   * deliberate edit by a full editor — totals, per-sandbox caps, GPU types —
   * is never destroyed. Returns whether the row was deleted.
   */
  private async deleteCreatedQuotaIfUnchanged(request: QuotaRequest): Promise<boolean> {
    const result = await this.regionQuotaRepository
      .createQueryBuilder()
      .delete()
      .where('"organizationId" = :organizationId AND "regionId" = :regionId AND "sandboxClass" = :sandboxClass', {
        organizationId: request.organizationId,
        regionId: request.regionId,
        sandboxClass: request.sandboxClass,
      })
      .andWhere('"updatedAt" = "createdAt"')
      .execute()
    return (result.affected ?? 0) > 0
  }

  /**
   * Revert, releasing the claim on transient failure: the request returns to
   * PENDING so the decision can be retried, and the error propagates.
   */
  private async revertOrUnclaim(request: QuotaRequest): Promise<boolean> {
    try {
      return await this.revertQuota(request)
    } catch (error) {
      await this.requestRepository.update(
        { id: request.id },
        { status: QuotaRequestStatus.PENDING, decidedById: null, decidedByEmail: null, decidedAt: null },
      )
      throw error
    }
  }

  /**
   * Atomically transition a request out of PENDING so concurrent decisions can't
   * double-act. Returns the pre-claim row (with its before/after snapshots).
   */
  private async claimPending(id: string, to: QuotaRequestStatus, actor: RequestActor): Promise<QuotaRequest> {
    const request = await this.requestRepository.findOne({ where: { id } })
    if (!request) {
      throw new NotFoundException(`Quota request ${id} not found`)
    }
    const claim = await this.requestRepository.update(
      { id, status: QuotaRequestStatus.PENDING },
      { status: to, decidedById: actor.id, decidedByEmail: actor.email, decidedAt: new Date() },
    )
    if (claim.affected === 0) {
      throw new BadRequestException(`Quota request ${id} is no longer pending`)
    }
    return request
  }

  private async getOrThrow(id: string): Promise<QuotaRequest> {
    const request = await this.requestRepository.findOne({ where: { id } })
    if (!request) {
      throw new NotFoundException(`Quota request ${id} not found`)
    }
    return request
  }

  /**
   * Sum the grants of one kind an editor handed out in the rolling window that
   * took effect (still pending or made permanent). Updates and creates draw
   * from separate budgets.
   */
  private async spentInWindow(actorId: string, kind: QuotaRequestKind): Promise<QuotaAmounts> {
    const since = new Date(Date.now() - BUDGET_WINDOW_HOURS * 60 * 60 * 1000)
    const sums: Record<keyof QuotaAmounts, string | null> = await this.requestRepository
      .createQueryBuilder('r')
      .select('SUM(r.cpuDelta)', 'cpu')
      .addSelect('SUM(r.memoryDelta)', 'memory')
      .addSelect('SUM(r.diskDelta)', 'disk')
      .addSelect('SUM(r.gpuDelta)', 'gpu')
      .where('r.requestedById = :actorId', { actorId })
      .andWhere('r.createdAt > :since', { since })
      .andWhere('r.kind = :kind', { kind })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [QuotaRequestStatus.PENDING, QuotaRequestStatus.APPROVED],
      })
      .getRawOne()
    return {
      cpu: Number(sums?.cpu ?? 0),
      memory: Number(sums?.memory ?? 0),
      disk: Number(sums?.disk ?? 0),
      gpu: Number(sums?.gpu ?? 0),
    }
  }
}
