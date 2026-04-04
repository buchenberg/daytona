/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, IsNull } from 'typeorm'
import { Conversation } from './entities/conversation.entity'
import { Message } from './entities/message.entity'
import { ThreadCollaborator } from './entities/thread-collaborator.entity'
import { convertAnthropicToAssistantUI } from './message-converter'

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation, 'backoffice')
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message, 'backoffice')
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(ThreadCollaborator, 'backoffice')
    private readonly collaboratorRepo: Repository<ThreadCollaborator>,
  ) {}

  async create(userId: string): Promise<{ id: string; title: string; createdAt: Date }> {
    const conversation = this.conversationRepo.create({ userId })
    const saved = await this.conversationRepo.save(conversation)
    return { id: saved.id, title: saved.title, createdAt: saved.createdAt }
  }

  // Returns owned conversations + conversations where user is a collaborator
  async list(userId: string, limit = 50, offset = 0) {
    const owned = await this.conversationRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: limit,
      skip: offset,
    })

    const collaborations = await this.collaboratorRepo.find({
      where: { userId },
      relations: ['conversation'],
    })

    const collabConversations = collaborations
      .filter((c) => c.conversation)
      .map((c) => ({
        id: c.conversation.id,
        title: c.conversation.title,
        createdAt: c.conversation.createdAt,
        updatedAt: c.conversation.updatedAt,
        isCollaboration: true,
        collaborationMode: c.mode,
      }))

    const ownedMapped = owned.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      isCollaboration: false,
      collaborationMode: undefined as string | undefined,
    }))

    return [...ownedMapped, ...collabConversations]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
  }

  async getWithMessages(conversationId: string, userId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')

    const access = await this.checkAccess(conversationId, userId)
    if (!access) throw new ForbiddenException('Not authorized to view this conversation')

    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    })

    const convertedMessages = convertAnthropicToAssistantUI(messages.map((m) => ({ role: m.role, content: m.content })))

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      isOwner: conversation.userId === userId,
      collaborationMode: access === 'owner' ? undefined : access,
      messages: convertedMessages,
    }
  }

  async rename(conversationId: string, userId: string, title: string) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } })
    if (!conversation) throw new NotFoundException('Conversation not found')
    if (conversation.userId !== userId) throw new ForbiddenException('Only the owner can rename')
    await this.conversationRepo.update(conversationId, { title })
    return { success: true }
  }

  async delete(conversationId: string, userId: string) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } })
    if (!conversation) throw new NotFoundException('Conversation not found')
    if (conversation.userId !== userId) throw new ForbiddenException('Only the owner can delete')
    await this.conversationRepo.delete(conversationId)
    return { success: true }
  }

  async addMessage(conversationId: string, role: string, content: unknown) {
    const message = this.messageRepo.create({ conversationId, role, content })
    await this.messageRepo.save(message)
    await this.conversationRepo.update(conversationId, { updatedAt: new Date() })
    return message
  }

  async getAnthropicMessages(conversationId: string) {
    const messages = await this.messageRepo.find({
      where: { conversationId, compactedAt: IsNull() },
      order: { createdAt: 'ASC' },
    })

    // Sanitize: strip tool_use blocks from any assistant message that isn't
    // followed by a user message containing matching tool_result blocks.
    // This handles every corruption scenario (abort, crash, race condition)
    // without needing the write path to be perfect.
    const result: { role: 'user' | 'assistant'; content: unknown }[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      const content = m.content
      if (
        m.role === 'assistant' &&
        Array.isArray(content) &&
        content.some((b: { type?: string }) => b.type === 'tool_use')
      ) {
        const next = messages[i + 1]
        const nextHasResults =
          next?.role === 'user' &&
          Array.isArray(next.content) &&
          next.content.some((b: { type?: string }) => b.type === 'tool_result')
        if (!nextHasResults) {
          // Strip tool_use blocks, keep only text
          const textOnly = content.filter((b: { type?: string }) => b.type !== 'tool_use')
          if (textOnly.length > 0) {
            result.push({ role: 'assistant', content: textOnly })
          }
          continue
        }
      }
      result.push({ role: m.role as 'user' | 'assistant', content: m.content })
    }
    return result
  }

  async findById(conversationId: string) {
    return this.conversationRepo.findOne({ where: { id: conversationId } })
  }

  async updateTitle(conversationId: string, title: string) {
    await this.conversationRepo.update(conversationId, { title })
  }

  // Returns 'owner' | 'read' | 'write' | null
  async checkAccess(conversationId: string, userId: string): Promise<'owner' | 'read' | 'write' | null> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } })
    if (!conversation) return null
    if (conversation.userId === userId) return 'owner'

    const collaborator = await this.collaboratorRepo.findOne({
      where: { conversationId, userId },
    })
    return collaborator?.mode ?? null
  }

  async deleteMessagesAfter(conversationId: string, userId: string, keepCount: number) {
    const access = await this.checkAccess(conversationId, userId)
    if (!access || access === 'read') throw new ForbiddenException('Cannot modify this conversation')

    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      select: ['id'],
    })

    if (keepCount >= messages.length) return { deleted: 0 }

    const toDelete = messages.slice(keepCount).map((m) => m.id)
    await this.messageRepo.delete(toDelete)
    return { deleted: toDelete.length }
  }

  async deleteAllMessages(conversationId: string) {
    await this.messageRepo.delete({ conversationId })
  }

  static generateTitle(userMessage: string): string {
    const text = userMessage.trim()
    if (text.length <= 60) return text
    const truncated = text.substring(0, 57).replace(/\s+\S*$/, '')
    return truncated + '...'
  }
}
