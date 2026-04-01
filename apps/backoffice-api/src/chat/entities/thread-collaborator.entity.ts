/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm'
import { Conversation } from './conversation.entity'

@Entity('mali_thread_collaborator')
@Unique(['conversationId', 'userId'])
export class ThreadCollaborator {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string

  @Column({ type: 'varchar' })
  mode: 'read' | 'write'

  @Column({ name: 'granted_by', type: 'varchar' })
  grantedBy: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation
}
