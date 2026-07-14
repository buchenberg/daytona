import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { nanoid } from 'nanoid'
import { SECRET_PLACEHOLDER_PREFIX } from '../constants/secret.constants'

@Entity()
@Index(['organizationId', 'name'], { unique: true })
export class Secret {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  name: string

  @Column({ type: 'text' })
  encryptedValue: string

  @Column({ nullable: true })
  description?: string

  @Column({ type: 'character varying' })
  placeholder: string = SECRET_PLACEHOLDER_PREFIX + nanoid(16).toLowerCase()

  @Column({ type: 'uuid' })
  organizationId: string

  @CreateDateColumn({
    type: 'timestamp with time zone',
  })
  createdAt: Date

  @Column({
    type: 'text',
    array: true,
    default: '{}',
  })
  hosts: string[] = []

  @UpdateDateColumn({
    type: 'timestamp with time zone',
  })
  updatedAt: Date
}
