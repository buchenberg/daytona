/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'
import { Permissions } from '../../common/permissions'

@Entity('backoffice_user')
@Index(['email'], { unique: true })
@Index(['isActive'])
export class BackofficeUser {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true })
  email: string

  @Column({ nullable: true })
  name?: string

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  permissions: Permissions

  @Column({ name: 'is_active', default: true })
  isActive: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date

  @Column({ name: 'last_login_at', type: 'timestamp with time zone', nullable: true })
  lastLoginAt?: Date

  @Column({ name: 'created_by', nullable: true })
  createdBy?: string
}
