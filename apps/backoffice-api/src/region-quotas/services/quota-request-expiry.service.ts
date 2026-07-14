import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Repository } from 'typeorm'
import { QuotaRequest, QuotaRequestStatus } from '../../backoffice-db/entities/quota-request.entity'
import { AuditService } from '../../audit/audit.service'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { QuotaRequestService } from './quota-request.service'

const SYSTEM_ACTOR = { id: 'system', email: 'system@daytona.io' }

/**
 * Auto-reverts temporary quota requests once they pass their TTL without a decision.
 * Each due request is claimed atomically (UPDATE … WHERE status = PENDING), so the
 * job is safe to run on multiple replicas without distributed locking.
 */
@Injectable()
export class QuotaRequestExpiryService {
  private readonly logger = new Logger(QuotaRequestExpiryService.name)

  constructor(
    @InjectRepository(QuotaRequest, 'backoffice')
    private readonly requestRepository: Repository<QuotaRequest>,
    private readonly quotaRequestService: QuotaRequestService,
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'revert-expired-quota-requests' })
  async revertExpiredRequests(): Promise<void> {
    const now = new Date()
    const due = await this.requestRepository.find({
      where: { status: QuotaRequestStatus.PENDING, expiresAt: LessThanOrEqual(now) },
    })
    if (!due.length) return

    for (const request of due) {
      // Atomically claim the request; if another worker got it first, skip.
      const claim = await this.requestRepository.update(
        { id: request.id, status: QuotaRequestStatus.PENDING },
        { status: QuotaRequestStatus.EXPIRED, decidedAt: now },
      )
      if (claim.affected === 0) continue

      let reverted: boolean
      try {
        reverted = await this.quotaRequestService.revertQuota(request)
      } catch (error) {
        // Transient revert failure — release the claim so the next run retries.
        await this.requestRepository.update({ id: request.id }, { status: QuotaRequestStatus.PENDING, decidedAt: null })
        this.logger.error(`Failed to revert expired request ${request.id}, will retry: ${(error as Error).message}`)
        continue
      }
      if (!reverted) {
        await this.requestRepository.update({ id: request.id }, { status: QuotaRequestStatus.SUPERSEDED })
      }

      await this.auditService
        .createLog({
          actorId: SYSTEM_ACTOR.id,
          actorEmail: SYSTEM_ACTOR.email,
          action: AuditAction.QUOTA_REQUEST_EXPIRE,
          targetType: AuditTarget.QUOTA_REQUEST,
          targetId: request.id,
          metadata: {
            organizationId: request.organizationId,
            regionId: request.regionId,
            sandboxClass: request.sandboxClass,
            kind: request.kind,
            reverted,
            cpuDelta: request.cpuDelta,
            memoryDelta: request.memoryDelta,
            diskDelta: request.diskDelta,
            gpuDelta: request.gpuDelta,
          },
        })
        .catch((err) => this.logger.error(`Failed to audit expiry of request ${request.id}: ${err.message}`))

      this.logger.log(`Expired quota request ${request.id} (reverted=${reverted})`)
    }
  }
}
