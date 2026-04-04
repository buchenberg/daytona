/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, LessThan } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import { Memory } from './entities/memory.entity'
import { ConversationsService } from './conversations.service'
import { parseLlmJson } from './parse-llm-json'

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

  async list(limit = 30): Promise<Memory[]> {
    return this.memoryRepo.find({
      order: { updatedAt: 'DESC' },
      take: limit,
    })
  }

  async store(createdBy: string, key: string, value: string, category = 'finding'): Promise<Memory> {
    // Upsert by key
    const existing = await this.memoryRepo.findOne({ where: { key } })
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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await this.memoryRepo.delete({ updatedAt: LessThan(thirtyDaysAgo) })
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
        messages: [
          {
            role: 'user',
            content: `Analyze this conversation excerpt and extract ONE useful insight, best practice, or reusable pattern that would help in future production operations investigations. Return a JSON object with "key" (short identifier, snake_case) and "value" (the insight, 1-2 sentences). Return ONLY the JSON, no other text.\n\n${JSON.stringify(recent)}`,
          },
        ],
      })

      const raw = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
      const parsed = parseLlmJson<{ key?: string; value?: string }>(raw)
      if (parsed.key && parsed.value) {
        return this.store(userId, parsed.key, parsed.value, 'learning')
      }
    } catch (error) {
      this.logger.warn('Failed to generate memory from conversation:', error)
    }
    return null
  }

  /** Build a prompt block with recent memory entries for injection into system prompt. */
  async getPromptBlock(): Promise<string> {
    const memories = await this.list(20)
    if (memories.length === 0) return ''
    const lines = memories.map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
    return `\n\n### Shared Knowledge Base\nThese are findings and learnings from previous investigations, shared across all users:\n${lines.join('\n')}`
  }
}
