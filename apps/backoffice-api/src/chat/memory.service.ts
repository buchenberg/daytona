/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, LessThan, Not } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import { Memory } from './entities/memory.entity'
import { ConversationsService } from './conversations.service'

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name)
  private readonly client: Anthropic
  private readonly model: string
  private readonly contextMessages: number

  constructor(
    @InjectRepository(Memory, 'backoffice')
    private readonly memoryRepo: Repository<Memory>,
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
  ) {
    const apiKey = this.configService.get<string>('mali.anthropicApiKey')
    this.client = new Anthropic({ apiKey })
    this.model = this.configService.get<string>('mali.suggestionModel') || 'claude-haiku-4-5-20251001'
    this.contextMessages = parseInt(this.configService.get<string>('mali.memoryContextMessages') || '5', 10)
  }

  async list(limit = 200): Promise<Memory[]> {
    return this.memoryRepo.find({
      order: { updatedAt: 'DESC' },
      take: limit,
    })
  }

  async findByKey(key: string): Promise<Memory | null> {
    return this.memoryRepo.findOne({ where: { key } })
  }

  async store(createdBy: string, key: string, value: string, category = 'finding'): Promise<Memory> {
    // Upsert by key
    const existing = await this.findByKey(key)
    if (existing) {
      existing.value = value
      existing.category = category
      existing.createdBy = createdBy
      return this.memoryRepo.save(existing)
    }
    const memory = this.memoryRepo.create({ createdBy, key, value, category })
    return this.memoryRepo.save(memory)
  }

  async forget(key: string): Promise<boolean> {
    const result = await this.memoryRepo.delete({ key })
    return (result.affected ?? 0) > 0
  }

  async cleanup(): Promise<number> {
    // Curated entries (managed by superadmins in the dashboard) never expire;
    // auto-extracted and tool-stored entries age out after 30 days.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await this.memoryRepo.delete({ updatedAt: LessThan(thirtyDaysAgo), category: Not('curated') })
    return result.affected ?? 0
  }

  /** Generate a memory from the last N messages of a conversation using the suggestion model. */
  async rememberFromConversation(conversationId: string, userId: string): Promise<Memory | null> {
    const history = await this.conversationsService.getAnthropicMessages(conversationId)
    const recent = history.slice(-this.contextMessages) as Anthropic.MessageParam[]
    if (recent.length === 0) return null

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'Short snake_case identifier' },
                value: { type: 'string', description: 'The insight, 1-2 sentences' },
              },
              required: ['key', 'value'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: 'user',
            content: `Analyze this conversation excerpt and extract ONE useful insight, best practice, or reusable pattern that would help in future production operations investigations.\n\n${JSON.stringify(recent)}`,
          },
        ],
      })

      const raw = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
      const parsed = JSON.parse(raw) as { key?: string; value?: string }
      if (parsed.key && parsed.value) {
        return this.store(userId, parsed.key, parsed.value, 'learning')
      }
    } catch (error) {
      this.logger.warn('Failed to generate memory from conversation:', error)
    }
    return null
  }

  /** Build a prompt block with memory entries for injection into system prompt. */
  async getPromptBlock(): Promise<string> {
    // Curated entries take priority over the recency slots, capped so the
    // system prompt cannot grow without bound.
    const curated = await this.memoryRepo.find({
      where: { category: 'curated' },
      order: { updatedAt: 'DESC' },
      take: 100,
    })
    const recent = await this.memoryRepo.find({
      where: { category: Not('curated') },
      order: { updatedAt: 'DESC' },
      take: 30,
    })
    const memories = [...curated, ...recent]
    if (memories.length === 0) return ''
    const lines = memories.map((m) => {
      const date = m.updatedAt.toISOString().slice(0, 10)
      return `- [${m.category}] ${m.key}: ${m.value} (by ${m.createdBy}, ${date})`
    })
    return (
      `\n\n### Shared Knowledge Base\n` +
      `Findings and learnings from previous investigations, shared across all users. ` +
      `Weigh entries by age — older entries may be stale. ` +
      `Use the \`memory_store\` tool to save new durable insights you discover, and \`memory_forget\` ` +
      `to remove entries you confirm are wrong or obsolete.\n${lines.join('\n')}`
    )
  }
}
