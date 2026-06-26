/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Sandbox } from './sandbox.entity'
import { Secret } from '../../secret/entities/secret.entity'

@Entity('sandbox_secrets')
export class SandboxSecret {
  @PrimaryColumn()
  sandboxId: string

  @PrimaryColumn()
  envVar: string

  @Column('uuid')
  secretId: string

  @ManyToOne(() => Sandbox, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sandboxId' })
  sandbox?: Sandbox

  @ManyToOne(() => Secret, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'secretId' })
  secret?: Secret
}
