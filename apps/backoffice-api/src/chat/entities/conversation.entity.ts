/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm'
import { Message } from './message.entity'

@Entity('mali_conversation')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', default: 'New conversation' })
  title: string

  @Index()
  @Column({ name: 'user_id', type: 'varchar' })
  userId: string

  // Pinned conversations are exempt from retention autodeletion.
  @Column({ type: 'boolean', default: false })
  pinned: boolean

  // Context size of the latest model round (input + cache read/creation tokens).
  @Column({ name: 'input_tokens', type: 'int', default: 0 })
  inputTokens: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @Index()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date

  @OneToMany(() => Message, (message) => message.conversation, { cascade: true })
  messages: Message[]
}
