import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity()
@Index('warm_pool_find_idx', ['snapshot', 'target', 'cpu', 'mem', 'disk', 'gpu', 'osUser', 'env'])
// Per-organization dedup key for self-serve pools; legacy/global pools (null org) are exempt.
@Index('warm_pool_org_snapshot_target_unique', ['organizationId', 'snapshot', 'target'], {
  unique: true,
  where: '"organizationId" IS NOT NULL',
})
export class WarmPool {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // Owning organization for self-serve warm pools. Null marks a legacy/global warm pool whose
  // sandboxes use the all-zero sentinel organization instead.
  @Column({ type: 'uuid', nullable: true })
  @Index('warm_pool_organizationid_idx')
  organizationId?: string | null

  @Column()
  pool: number

  @Column()
  snapshot: string

  @Column()
  target: string

  @Column()
  cpu: number

  @Column()
  mem: number

  @Column()
  disk: number

  @Column()
  gpu: number

  @Column()
  gpuType: string

  @Column()
  osUser: string

  @Column({ nullable: true })
  errorReason?: string

  @Column({
    type: 'simple-json',
    default: {},
  })
  env: { [key: string]: string }

  @CreateDateColumn({
    type: 'timestamp with time zone',
  })
  createdAt: Date

  @UpdateDateColumn({
    type: 'timestamp with time zone',
  })
  updatedAt: Date
}
