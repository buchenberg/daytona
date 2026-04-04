/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

@Entity('mali_memory')
@Index(['category'])
export class Memory {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string

  @Column({ type: 'varchar' })
  key: string

  @Column({ type: 'text' })
  value: string

  @Column({ type: 'varchar', default: 'finding' })
  category: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
