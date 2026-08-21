import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

export enum RunnerEventType {
  INVENTORY_ADDED = 'inventory_added',
  INVENTORY_ENABLED = 'inventory_enabled',
  INVENTORY_DISABLED = 'inventory_disabled',
  INVENTORY_REMOVED = 'inventory_removed',
  REQUEST_CREATED = 'request_created',
  REQUEST_STATUS_CHANGED = 'request_status_changed',
  NOTE = 'note',
}

/**
 * Append-only timeline of what happened to a runner (inventory changes,
 * maintenance requests) or to a request (notes). A null runnerName means the
 * event is request-scoped. Stored on the backoffice connection.
 */
@Entity('fleet_runner_event')
@Index(['runnerName'])
@Index(['requestId'])
export class RunnerEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'runner_name', type: 'character varying', nullable: true })
  runnerName?: string | null

  @Column({ type: 'character varying' })
  type: RunnerEventType

  @Column({ type: 'text' })
  message: string

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId?: string | null

  /** Backoffice user email, or 'system' for sync and cron events */
  @Column()
  actor: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
