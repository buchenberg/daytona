/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm'
import { Conversation } from './conversation.entity'

@Entity('mali_message')
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string

  @Column({ type: 'varchar' })
  role: string

  @Column({ type: 'jsonb' })
  content: unknown

  @Column({ name: 'compacted_at', type: 'timestamptz', nullable: true })
  compactedAt: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation
}
