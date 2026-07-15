import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

export enum MaintenanceType {
  DRAIN = 'drain',
  REBOOT = 'reboot',
  REINSTALL = 'reinstall',
  DECOMMISSION = 'decommission',
  OTHER = 'other',
}

/**
 * Workflow of a maintenance request:
 *
 *   requested → acknowledged → draining → ready_for_maintenance
 *             → in_maintenance → restored → closed
 *
 * Draining requests auto-advance to ready_for_maintenance once every targeted
 * runner is fully evacuated. Anything before in_maintenance can be cancelled;
 * once hands are on the machine the request must run through restored/closed.
 */
export enum MaintenanceStatus {
  REQUESTED = 'requested',
  ACKNOWLEDGED = 'acknowledged',
  DRAINING = 'draining',
  READY_FOR_MAINTENANCE = 'ready_for_maintenance',
  IN_MAINTENANCE = 'in_maintenance',
  RESTORED = 'restored',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export const ALLOWED_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  [MaintenanceStatus.REQUESTED]: [MaintenanceStatus.ACKNOWLEDGED, MaintenanceStatus.CANCELLED],
  [MaintenanceStatus.ACKNOWLEDGED]: [
    MaintenanceStatus.DRAINING,
    MaintenanceStatus.READY_FOR_MAINTENANCE,
    MaintenanceStatus.CANCELLED,
  ],
  [MaintenanceStatus.DRAINING]: [MaintenanceStatus.READY_FOR_MAINTENANCE, MaintenanceStatus.CANCELLED],
  [MaintenanceStatus.READY_FOR_MAINTENANCE]: [MaintenanceStatus.IN_MAINTENANCE, MaintenanceStatus.CANCELLED],
  [MaintenanceStatus.IN_MAINTENANCE]: [MaintenanceStatus.RESTORED],
  [MaintenanceStatus.RESTORED]: [MaintenanceStatus.CLOSED],
  [MaintenanceStatus.CLOSED]: [],
  [MaintenanceStatus.CANCELLED]: [],
}

export const TERMINAL_STATUSES = [MaintenanceStatus.CLOSED, MaintenanceStatus.CANCELLED]

export const OPEN_STATUSES = Object.values(MaintenanceStatus).filter((s) => !TERMINAL_STATUSES.includes(s))

/**
 * An infra maintenance request ("drain h5001", "reboot this batch") tracked
 * from intake to completion. Stored on the backoffice connection.
 */
@Entity('maintenance_request')
@Index(['status'])
export class MaintenanceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  title: string

  @Column({ type: 'text', default: '' })
  description: string

  @Column({ type: 'character varying' })
  type: MaintenanceType

  @Column({ type: 'character varying', default: MaintenanceStatus.REQUESTED })
  status: MaintenanceStatus

  /** Targeted inventory hostnames (fleet_runner.name) */
  @Column({ name: 'runner_names', type: 'text', array: true })
  runnerNames: string[]

  /** Who asked for the work (free-form, e.g. the infra engineer) */
  @Column({ name: 'requested_by' })
  requestedBy: string

  /** Backoffice user who filed the request */
  @Column({ name: 'created_by' })
  createdBy: string

  /** Urgency: 0 = p0 (most urgent) … 3 = p3 */
  @Column({ type: 'smallint', default: 2 })
  priority: number

  /** Set on transition into a terminal status */
  @Column({ name: 'closed_at', type: 'timestamp with time zone', nullable: true })
  closedAt?: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date
}
