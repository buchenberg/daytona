/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

@Entity('audit_log')
@Index(['actorEmail'])
@Index(['createdAt'])
@Index(['action'])
@Index(['targetType', 'targetId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'actor_id' })
  actorId: string

  @Column({ name: 'actor_email' })
  actorEmail: string

  @Column()
  action: string

  @Column({ name: 'target_type', nullable: true })
  targetType?: string

  @Column({ name: 'target_id', nullable: true })
  targetId?: string

  @Column({ name: 'status_code', nullable: true })
  statusCode?: number

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string

  @Column({ name: 'ip_address', nullable: true })
  ipAddress?: string

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
