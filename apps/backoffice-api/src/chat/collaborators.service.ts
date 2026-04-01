/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ThreadCollaborator } from './entities/thread-collaborator.entity'
import { Conversation } from './entities/conversation.entity'
import { BackofficeUser } from '../backoffice-db/entities/backoffice-user.entity'

@Injectable()
export class CollaboratorsService {
  constructor(
    @InjectRepository(ThreadCollaborator, 'backoffice')
    private readonly collaboratorRepo: Repository<ThreadCollaborator>,
    @InjectRepository(Conversation, 'backoffice')
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(BackofficeUser, 'backoffice')
    private readonly userRepo: Repository<BackofficeUser>,
  ) {}

  async listUsers() {
    const users = await this.userRepo.find({
      where: { isActive: true },
      order: { email: 'ASC' },
    })
    return users.map((u) => ({ id: u.id, email: u.email, name: u.name }))
  }

  async addCollaborator(conversationId: string, targetUserId: string, mode: 'read' | 'write', grantedBy: string) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } })
    if (!conversation) throw new NotFoundException('Conversation not found')
    if (conversation.userId !== grantedBy) throw new ForbiddenException('Only the owner can add collaborators')
    if (targetUserId === grantedBy) throw new BadRequestException('Cannot add yourself as a collaborator')

    const existing = await this.collaboratorRepo.findOne({
      where: { conversationId, userId: targetUserId },
    })

    if (existing) {
      existing.mode = mode
      await this.collaboratorRepo.save(existing)
      return { id: existing.id, userId: existing.userId, mode, createdAt: existing.createdAt }
    }

    const collaborator = this.collaboratorRepo.create({
      conversationId,
      userId: targetUserId,
      mode,
      grantedBy,
    })
    const saved = await this.collaboratorRepo.save(collaborator)
    return { id: saved.id, userId: saved.userId, mode: saved.mode, createdAt: saved.createdAt }
  }

  async listCollaborators(conversationId: string, requesterId: string) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } })
    if (!conversation) throw new NotFoundException('Conversation not found')
    if (conversation.userId !== requesterId) {
      const isCollaborator = await this.collaboratorRepo.findOne({
        where: { conversationId, userId: requesterId },
      })
      if (!isCollaborator) throw new ForbiddenException('Not authorized')
    }

    const collaborators = await this.collaboratorRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    })
    return collaborators.map((c) => ({
      id: c.id,
      userId: c.userId,
      mode: c.mode,
      grantedBy: c.grantedBy,
      createdAt: c.createdAt,
    }))
  }

  async removeCollaborator(conversationId: string, targetUserId: string, requesterId: string) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } })
    if (!conversation) throw new NotFoundException('Conversation not found')
    if (conversation.userId !== requesterId) throw new ForbiddenException('Only the owner can remove collaborators')

    await this.collaboratorRepo.delete({ conversationId, userId: targetUserId })
    return { success: true }
  }

  async getCollaboratorMode(conversationId: string, userId: string): Promise<'read' | 'write' | null> {
    const collaborator = await this.collaboratorRepo.findOne({
      where: { conversationId, userId },
    })
    return collaborator?.mode ?? null
  }
}
