import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

/**
 * One host from the workspaces-playbook Ansible inventory, mirrored by the
 * fleet inventory sync. The primary key is the inventory hostname (h5001);
 * `domain` (h5001.daytona.work) is the join key to the production `runner`
 * table — production runner names are UUIDs, never join on those.
 */
@Entity('fleet_runner')
@Index(['env'])
@Index(['domain'])
export class FleetRunner {
  @PrimaryColumn()
  name: string

  /** Playbook root the host came from, e.g. ansible/runners */
  @Column()
  source: string

  /** False when the host line is commented out in the inventory */
  @Column({ default: true })
  enabled: boolean

  @Column()
  env: string

  @Column({ type: 'character varying', nullable: true })
  provider?: string | null

  @Column({ name: 'server_type', type: 'character varying', nullable: true })
  serverType?: string | null

  @Column({ type: 'character varying', nullable: true })
  os?: string | null

  @Column({ type: 'character varying', nullable: true })
  ip?: string | null

  @Column({ type: 'character varying', nullable: true })
  geo?: string | null

  @Column({ type: 'character varying', nullable: true })
  region?: string | null

  @Column({ type: 'character varying', nullable: true })
  location?: string | null

  @Column({ type: 'character varying', nullable: true })
  model?: string | null

  @Column({ name: 'nic_speed', type: 'character varying', nullable: true })
  nicSpeed?: string | null

  @Column({ name: 'monthly_cost', type: 'numeric', precision: 12, scale: 2, nullable: true })
  monthlyCost?: string | null

  @Column({ name: 'hourly_cost', type: 'numeric', precision: 12, scale: 2, nullable: true })
  hourlyCost?: string | null

  @Column({ type: 'character varying', nullable: true })
  tenant?: string | null

  @Column({ default: false })
  gpu: boolean

  /** All resolved inventory group names, shallowest ancestor first */
  @Column({ type: 'text', array: true, default: '{}' })
  groups: string[]

  @Column({ type: 'character varying', nullable: true })
  domain?: string | null

  /** Git author date of the host_vars file creation — first provision */
  @Column({ name: 'provisioned_at', type: 'timestamp with time zone', nullable: true })
  provisionedAt?: Date | null

  /** Set when the host disappears from the inventory */
  @Column({ name: 'removed_at', type: 'timestamp with time zone', nullable: true })
  removedAt?: Date | null

  @Column({ name: 'last_sync_at', type: 'timestamp with time zone' })
  lastSyncAt: Date

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date
}
