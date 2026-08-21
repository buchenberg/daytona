import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm'
import { Sandbox } from './sandbox.entity'
import { SandboxActivitySource } from '../common/sandbox-activity-source'

@Entity('sandbox_last_activity')
export class SandboxLastActivity {
  @PrimaryColumn()
  sandboxId: string

  @Column({ nullable: true, type: 'timestamp with time zone' })
  lastActivityAt?: Date

  @Column({ nullable: true, type: 'text' })
  lastActivitySource?: SandboxActivitySource | null

  @OneToOne(() => Sandbox, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sandboxId' })
  sandbox?: Sandbox
}
