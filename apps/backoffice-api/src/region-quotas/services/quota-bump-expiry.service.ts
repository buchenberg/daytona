/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Repository } from 'typeorm'
import { QuotaBumpRequest, QuotaBumpStatus } from '../../backoffice-db/entities/quota-bump-request.entity'
import { AuditService } from '../../audit/audit.service'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { QuotaBumpService } from './quota-bump.service'

const SYSTEM_ACTOR = { id: 'system', email: 'system@daytona.io' }

/**
 * Auto-reverts temporary quota bumps once they pass their TTL without a decision.
 * Each due bump is claimed atomically (UPDATE … WHERE status = PENDING), so the
 * job is safe to run on multiple replicas without distributed locking.
 */
@Injectable()
export class QuotaBumpExpiryService {
  private readonly logger = new Logger(QuotaBumpExpiryService.name)

  constructor(
    @InjectRepository(QuotaBumpRequest, 'backoffice')
    private readonly bumpRepository: Repository<QuotaBumpRequest>,
    private readonly quotaBumpService: QuotaBumpService,
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'revert-expired-quota-bumps' })
  async revertExpiredBumps(): Promise<void> {
    const now = new Date()
    const due = await this.bumpRepository.find({
      where: { status: QuotaBumpStatus.PENDING, expiresAt: LessThanOrEqual(now) },
    })
    if (!due.length) return

    for (const bump of due) {
      // Atomically claim the bump; if another worker got it first, skip.
      const claim = await this.bumpRepository.update(
        { id: bump.id, status: QuotaBumpStatus.PENDING },
        { status: QuotaBumpStatus.EXPIRED, decidedAt: now },
      )
      if (claim.affected === 0) continue

      let reverted: boolean
      try {
        reverted = await this.quotaBumpService.revertQuota(bump)
      } catch (error) {
        // Transient revert failure — release the claim so the next run retries.
        await this.bumpRepository.update({ id: bump.id }, { status: QuotaBumpStatus.PENDING, decidedAt: null })
        this.logger.error(`Failed to revert expired bump ${bump.id}, will retry: ${(error as Error).message}`)
        continue
      }
      if (!reverted) {
        await this.bumpRepository.update({ id: bump.id }, { status: QuotaBumpStatus.SUPERSEDED })
      }

      await this.auditService
        .createLog({
          actorId: SYSTEM_ACTOR.id,
          actorEmail: SYSTEM_ACTOR.email,
          action: AuditAction.QUOTA_BUMP_EXPIRE,
          targetType: AuditTarget.QUOTA_BUMP_REQUEST,
          targetId: bump.id,
          metadata: {
            organizationId: bump.organizationId,
            regionId: bump.regionId,
            sandboxClass: bump.sandboxClass,
            reverted,
            cpuDelta: bump.cpuDelta,
            memoryDelta: bump.memoryDelta,
            diskDelta: bump.diskDelta,
          },
        })
        .catch((err) => this.logger.error(`Failed to audit expiry of bump ${bump.id}: ${err.message}`))

      this.logger.log(`Expired quota bump ${bump.id} (reverted=${reverted})`)
    }
  }
}
