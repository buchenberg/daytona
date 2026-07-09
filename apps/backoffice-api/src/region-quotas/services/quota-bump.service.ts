/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Repository } from 'typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { QuotaBumpRequest, QuotaBumpStatus } from '../../backoffice-db/entities/quota-bump-request.entity'
import { updateWithPreconditions } from '../../common/preconditions.util'
import { config } from '../../config/env'
import { CreateQuotaBumpDto } from '../dto'
import { BumpAmounts, validateDailyBudget, validatePercentCap } from './quota-bump-policy.util'

export interface BumpActor {
  id: string
  email: string
}

export interface BumpLimits {
  maxPercent: number
  flatIncrease: BumpAmounts
}

export interface BumpBudget {
  budget: BumpAmounts
  spent: BumpAmounts
  remaining: BumpAmounts
  limits: BumpLimits
}

// Rolling window the per-editor daily budget is measured over.
const BUDGET_WINDOW_HOURS = 24

const pendingBumpConflict = (organizationId: string, regionId: string, sandboxClass: SandboxClass) =>
  new ConflictException(
    `A pending bump already exists for organization ${organizationId}, region ${regionId} and ` +
      `sandbox class ${sandboxClass}. Approve, reject, or cancel it before creating another.`,
  )

@Injectable()
export class QuotaBumpService {
  private readonly logger = new Logger(QuotaBumpService.name)

  constructor(
    @InjectRepository(RegionQuota)
    private readonly regionQuotaRepository: Repository<RegionQuota>,
    @InjectRepository(QuotaBumpRequest, 'backoffice')
    private readonly bumpRepository: Repository<QuotaBumpRequest>,
  ) {}

  private get budget(): BumpAmounts {
    return {
      cpu: config.regionQuotas.bumpDailyBudgetCpu,
      memory: config.regionQuotas.bumpDailyBudgetMemory,
      disk: config.regionQuotas.bumpDailyBudgetDisk,
    }
  }

  private get flatIncrease(): BumpAmounts {
    return {
      cpu: config.regionQuotas.bumpFlatIncreaseCpu,
      memory: config.regionQuotas.bumpFlatIncreaseMemory,
      disk: config.regionQuotas.bumpFlatIncreaseDisk,
    }
  }

  /**
   * Apply a temporary, rate-limited increase to a region quota and record it as
   * PENDING so it can be approved (made permanent) or auto-reverted at expiry.
   */
  async createBump(actor: BumpActor, dto: CreateQuotaBumpDto): Promise<QuotaBumpRequest> {
    const sandboxClass = dto.sandboxClass ?? SandboxClass.CONTAINER
    const deltas: BumpAmounts = {
      cpu: dto.cpuDelta ?? 0,
      memory: dto.memoryDelta ?? 0,
      disk: dto.diskDelta ?? 0,
    }

    if (deltas.cpu <= 0 && deltas.memory <= 0 && deltas.disk <= 0) {
      throw new BadRequestException('At least one of cpuDelta, memoryDelta or diskDelta must be greater than zero')
    }

    const quota = await this.regionQuotaRepository.findOne({
      where: { organizationId: dto.organizationId, regionId: dto.regionId, sandboxClass },
    })
    if (!quota) {
      throw new NotFoundException(
        `Region quota not found for organization ${dto.organizationId}, region ${dto.regionId} and sandbox class ${sandboxClass}. ` +
          `A full quota editor must create it before it can be bumped.`,
      )
    }

    // One active bump per region_quota: a pending bump must be approved, rejected,
    // expired, or cancelled by its requester before another can be applied. This
    // keeps the snapshot-based revert unambiguous (no out-of-order stacking).
    const existingPending = await this.bumpRepository.findOne({
      where: {
        organizationId: dto.organizationId,
        regionId: dto.regionId,
        sandboxClass,
        status: QuotaBumpStatus.PENDING,
      },
    })
    if (existingPending) {
      throw pendingBumpConflict(dto.organizationId, dto.regionId, sandboxClass)
    }

    const current: BumpAmounts = {
      cpu: quota.totalCpuQuota,
      memory: quota.totalMemoryQuota,
      disk: quota.totalDiskQuota,
    }

    const percentViolations = validatePercentCap(
      current,
      deltas,
      config.regionQuotas.bumpMaxIncreasePercent,
      this.flatIncrease,
    )
    if (percentViolations.length) {
      throw new ForbiddenException({ message: percentViolations })
    }

    const spent = await this.spentInWindow(actor.id)
    const budgetViolations = validateDailyBudget(spent, deltas, this.budget)
    if (budgetViolations.length) {
      throw new ForbiddenException({ message: budgetViolations })
    }

    const after: BumpAmounts = {
      cpu: current.cpu + deltas.cpu,
      memory: current.memory + deltas.memory,
      disk: current.disk + deltas.disk,
    }

    // Apply immediately; preconditions guarantee no concurrent edit slipped in.
    await updateWithPreconditions(
      this.regionQuotaRepository,
      { organizationId: dto.organizationId, regionId: dto.regionId, sandboxClass },
      { totalCpuQuota: after.cpu, totalMemoryQuota: after.memory, totalDiskQuota: after.disk },
      { totalCpuQuota: current.cpu, totalMemoryQuota: current.memory, totalDiskQuota: current.disk },
    )

    const expiresAt = new Date(Date.now() + config.regionQuotas.bumpTtlHours * 60 * 60 * 1000)

    const bump = this.bumpRepository.create({
      organizationId: dto.organizationId,
      regionId: dto.regionId,
      sandboxClass,
      requestedById: actor.id,
      requestedByEmail: actor.email,
      cpuDelta: deltas.cpu,
      memoryDelta: deltas.memory,
      diskDelta: deltas.disk,
      cpuBefore: current.cpu,
      memoryBefore: current.memory,
      diskBefore: current.disk,
      cpuAfter: after.cpu,
      memoryAfter: after.memory,
      diskAfter: after.disk,
      status: QuotaBumpStatus.PENDING,
      reason: dto.reason ?? null,
      expiresAt,
    })

    try {
      return await this.bumpRepository.save(bump)
    } catch (error) {
      // The quota increase already landed on region_quota, but the tracking row
      // (on a separate DB connection, so no shared transaction) failed to persist.
      // Roll the increase back so we never leave a permanent, untracked over-grant
      // that no operator can see or expire.
      await updateWithPreconditions(
        this.regionQuotaRepository,
        { organizationId: dto.organizationId, regionId: dto.regionId, sandboxClass },
        { totalCpuQuota: current.cpu, totalMemoryQuota: current.memory, totalDiskQuota: current.disk },
        { totalCpuQuota: after.cpu, totalMemoryQuota: after.memory, totalDiskQuota: after.disk },
      ).catch((revertError) =>
        this.logger.error(
          `Failed to roll back quota for org ${dto.organizationId}, region ${dto.regionId}, ` +
            `class ${sandboxClass} after bump persistence error: ${(revertError as Error).message}`,
        ),
      )
      // Lost the race against another pending bump on the same region_quota
      // (partial unique index). Surface the same friendly conflict as the pre-check.
      if ((error as { code?: string }).code === '23505') {
        throw pendingBumpConflict(dto.organizationId, dto.regionId, sandboxClass)
      }
      throw error
    }
  }

  /** Make a pending bump permanent. Requires regionQuotas:write (enforced at the controller). */
  async approve(actor: BumpActor, id: string): Promise<QuotaBumpRequest> {
    await this.claimPending(id, QuotaBumpStatus.APPROVED, actor)
    return this.getOrThrow(id)
  }

  /** Reject a pending bump and revert the quota immediately. */
  async reject(actor: BumpActor, id: string, reason?: string): Promise<QuotaBumpRequest> {
    const bump = await this.claimPending(id, QuotaBumpStatus.REJECTED, actor)
    // If a full editor changed the quota meanwhile, the revert is skipped and the bump
    // is marked superseded rather than rejected.
    const reverted = await this.revertOrUnclaim(bump)
    const patch: Partial<QuotaBumpRequest> = {}
    if (!reverted) patch.status = QuotaBumpStatus.SUPERSEDED
    if (reason) patch.reason = bump.reason ? `${bump.reason}\n\nRejected: ${reason}` : `Rejected: ${reason}`
    if (Object.keys(patch).length) await this.bumpRepository.update({ id }, patch)
    return this.getOrThrow(id)
  }

  /** Cancel a pending bump and revert the quota. Only the original requester may cancel. */
  async cancel(actor: BumpActor, id: string): Promise<QuotaBumpRequest> {
    const bump = await this.getOrThrow(id)
    if (bump.requestedById !== actor.id) {
      throw new ForbiddenException('You can only cancel quota bumps you requested')
    }
    // Atomic claim guarded by requester so concurrent decisions can't double-act.
    const claim = await this.bumpRepository.update(
      { id, status: QuotaBumpStatus.PENDING, requestedById: actor.id },
      { status: QuotaBumpStatus.CANCELLED, decidedById: actor.id, decidedByEmail: actor.email, decidedAt: new Date() },
    )
    if (claim.affected === 0) {
      throw new BadRequestException(`Quota bump ${id} is no longer pending`)
    }
    // If a full editor changed the quota meanwhile, skip the revert (their edit wins).
    const reverted = await this.revertOrUnclaim(bump)
    if (!reverted) {
      await this.bumpRepository.update({ id }, { status: QuotaBumpStatus.SUPERSEDED })
    }
    return this.getOrThrow(id)
  }

  /** Pending bumps awaiting a decision — feeds the approvals/notifications tab. */
  async listPending(page = 1, pageSize = 25): Promise<{ items: QuotaBumpRequest[]; total: number }> {
    const [items, total] = await this.bumpRepository.findAndCount({
      where: { status: QuotaBumpStatus.PENDING },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return { items, total }
  }

  /** An editor's daily budget, what they've spent in the window, and what remains. */
  async getRemainingBudget(actorId: string): Promise<BumpBudget> {
    const budget = this.budget
    const spent = await this.spentInWindow(actorId)
    return {
      budget,
      spent,
      remaining: {
        cpu: Math.max(0, budget.cpu - spent.cpu),
        memory: Math.max(0, budget.memory - spent.memory),
        disk: Math.max(0, budget.disk - spent.disk),
      },
      limits: {
        maxPercent: config.regionQuotas.bumpMaxIncreasePercent,
        flatIncrease: this.flatIncrease,
      },
    }
  }

  /**
   * Atomically revert a bump's increase on region_quota. Only reverts if the
   * current totals still match what this bump set (`*After`); if a full editor
   * changed them in the meantime the precondition fails and we skip the revert,
   * letting the deliberate edit stand. Returns whether the revert was applied.
   */
  async revertQuota(bump: QuotaBumpRequest): Promise<boolean> {
    try {
      await updateWithPreconditions(
        this.regionQuotaRepository,
        { organizationId: bump.organizationId, regionId: bump.regionId, sandboxClass: bump.sandboxClass },
        { totalCpuQuota: bump.cpuBefore, totalMemoryQuota: bump.memoryBefore, totalDiskQuota: bump.diskBefore },
        { totalCpuQuota: bump.cpuAfter, totalMemoryQuota: bump.memoryAfter, totalDiskQuota: bump.diskAfter },
      )
      return true
    } catch (error) {
      // Precondition mismatch (quota deliberately changed) or row gone — leave the quota as-is.
      if (error instanceof ConflictException || (error as Error).message === 'Entity not found') {
        this.logger.warn(`Skipped revert of bump ${bump.id}: ${(error as Error).message}`)
        return false
      }
      // Transient failure — propagate so the caller can release its claim and retry.
      throw error
    }
  }

  /**
   * Revert, releasing the claim on transient failure: the bump returns to
   * PENDING so the decision can be retried, and the error propagates.
   */
  private async revertOrUnclaim(bump: QuotaBumpRequest): Promise<boolean> {
    try {
      return await this.revertQuota(bump)
    } catch (error) {
      await this.bumpRepository.update(
        { id: bump.id },
        { status: QuotaBumpStatus.PENDING, decidedById: null, decidedByEmail: null, decidedAt: null },
      )
      throw error
    }
  }

  /**
   * Atomically transition a bump out of PENDING so concurrent decisions can't
   * double-act. Returns the pre-claim row (with its before/after snapshots).
   */
  private async claimPending(id: string, to: QuotaBumpStatus, actor: BumpActor): Promise<QuotaBumpRequest> {
    const bump = await this.bumpRepository.findOne({ where: { id } })
    if (!bump) {
      throw new NotFoundException(`Quota bump ${id} not found`)
    }
    const claim = await this.bumpRepository.update(
      { id, status: QuotaBumpStatus.PENDING },
      { status: to, decidedById: actor.id, decidedByEmail: actor.email, decidedAt: new Date() },
    )
    if (claim.affected === 0) {
      throw new BadRequestException(`Quota bump ${id} is no longer pending`)
    }
    return bump
  }

  private async getOrThrow(id: string): Promise<QuotaBumpRequest> {
    const bump = await this.bumpRepository.findOne({ where: { id } })
    if (!bump) {
      throw new NotFoundException(`Quota bump ${id} not found`)
    }
    return bump
  }

  private async spentInWindow(actorId: string): Promise<BumpAmounts> {
    const since = new Date(Date.now() - BUDGET_WINDOW_HOURS * 60 * 60 * 1000)
    const rows = await this.bumpRepository.find({
      where: {
        requestedById: actorId,
        createdAt: MoreThan(since),
      },
    })
    // Count grants that took effect (still pending or made permanent).
    const counted = rows.filter((r) => r.status === QuotaBumpStatus.PENDING || r.status === QuotaBumpStatus.APPROVED)
    return {
      cpu: counted.reduce((sum, r) => sum + r.cpuDelta, 0),
      memory: counted.reduce((sum, r) => sum + r.memoryDelta, 0),
      disk: counted.reduce((sum, r) => sum + r.diskDelta, 0),
    }
  }
}
