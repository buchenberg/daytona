import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'

/** What a request grants: an update (increase) to an existing quota, or a newly created one. */
export enum QuotaRequestKind {
  UPDATE = 'update',
  CREATE = 'create',
}

/**
 * Lifecycle of a temporary region-quota request (update or create) granted by a support user.
 *
 *   PENDING  → applied to region_quota, awaiting a senior decision
 *   APPROVED → made permanent by a regionQuotas:write user
 *   REJECTED → reverted early by a regionQuotas:write user
 *   CANCELLED → reverted early by the requester themselves
 *   EXPIRED  → auto-reverted by the cron once expiresAt passed without a decision
 *   SUPERSEDED → a full edit changed the quota out from under the request, so the
 *                automatic revert was skipped (the deliberate edit wins)
 */
export enum QuotaRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  SUPERSEDED = 'superseded',
}

/**
 * A time-boxed, rate-limited increase to an organization's region_quota made by
 * support staff (regionQuotas:request). The increase is written to region_quota
 * immediately and auto-reverts after `expiresAt` unless a regionQuotas:write
 * user approves it. Stored on the backoffice connection.
 */
@Entity('quota_request')
@Index(['status'])
@Index(['expiresAt'])
@Index(['organizationId', 'regionId', 'sandboxClass'])
@Index(['requestedById', 'createdAt'])
export class QuotaRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // --- target region_quota composite key ---

  @Column({ name: 'organization_id' })
  organizationId: string

  @Column({ name: 'region_id' })
  regionId: string

  @Column({ name: 'sandbox_class', type: 'character varying', default: SandboxClass.CONTAINER })
  sandboxClass: SandboxClass

  // For CREATE the "request" is the whole quota (before = 0) and reverting
  // deletes the region_quota row instead of restoring the previous totals.
  @Column({ type: 'character varying', default: QuotaRequestKind.UPDATE })
  kind: QuotaRequestKind

  // --- requester (support user) ---

  @Column({ name: 'requested_by_id' })
  requestedById: string

  @Column({ name: 'requested_by_email' })
  requestedByEmail: string

  // --- granted increase (non-negative deltas, in cpu cores / GiB) ---

  @Column({ name: 'cpu_delta', type: 'int', default: 0 })
  cpuDelta: number

  @Column({ name: 'memory_delta', type: 'int', default: 0 })
  memoryDelta: number

  @Column({ name: 'disk_delta', type: 'int', default: 0 })
  diskDelta: number

  @Column({ name: 'gpu_delta', type: 'int', default: 0 })
  gpuDelta: number

  // --- snapshots for safe revert / audit ---

  @Column({ name: 'cpu_before', type: 'int' })
  cpuBefore: number

  @Column({ name: 'memory_before', type: 'int' })
  memoryBefore: number

  @Column({ name: 'disk_before', type: 'int' })
  diskBefore: number

  @Column({ name: 'gpu_before', type: 'int', default: 0 })
  gpuBefore: number

  @Column({ name: 'cpu_after', type: 'int' })
  cpuAfter: number

  @Column({ name: 'memory_after', type: 'int' })
  memoryAfter: number

  @Column({ name: 'disk_after', type: 'int' })
  diskAfter: number

  @Column({ name: 'gpu_after', type: 'int', default: 0 })
  gpuAfter: number

  @Column({ type: 'character varying', default: QuotaRequestStatus.PENDING })
  status: QuotaRequestStatus

  @Column({ type: 'text', nullable: true })
  reason?: string | null

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date

  // --- decision (approver) ---

  @Column({ name: 'decided_by_id', nullable: true })
  decidedById?: string | null

  @Column({ name: 'decided_by_email', nullable: true })
  decidedByEmail?: string | null

  @Column({ name: 'decided_at', type: 'timestamp with time zone', nullable: true })
  decidedAt?: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date
}
