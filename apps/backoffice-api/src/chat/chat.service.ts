/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import { ConversationsService } from './conversations.service'
import { SettingsService } from './settings.service'
import { ToolRegistry } from '../tools/tool-registry'
import { GrafanaService } from '../tools/grafana/grafana.service'
import { safeSummary } from '../tools/truncate'
import { SYSTEM_PROMPT } from './system-prompt'
import { matchSkills } from '../skills'

const MAX_ROUNDS = 15

interface ContentBlock {
  type: string
  id?: string
  name?: string
  text?: string
  input?: Record<string, unknown>
}

interface ChatStreamOptions {
  conversationId?: string
  message: string
  userId: string
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private readonly client: Anthropic
  private readonly model: string
  private readonly abortControllers = new Map<string, AbortController>()
  private datasourceBlock = ''
  private datasourceCacheExpiry = 0

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly settingsService: SettingsService,
    private readonly toolRegistry: ToolRegistry,
    private readonly grafana: GrafanaService,
  ) {
    const apiKey = this.configService.get<string>('mali.anthropicApiKey')
    this.client = new Anthropic({ apiKey })
    this.model = this.configService.get<string>('mali.model') || 'claude-sonnet-4-6'
    this.logger.log(`Mali chat service initialized with model: ${this.model}`)
  }

  async *streamChat(options: ChatStreamOptions): AsyncGenerator<string> {
    const { message, userId } = options
    let conversationId = options.conversationId

    const abortController = new AbortController()

    try {
      let isFirstMessage = false
      if (!conversationId) {
        const conv = await this.conversationsService.create(userId)
        conversationId = conv.id
        isFirstMessage = true
      } else {
        const existing = await this.conversationsService.findById(conversationId)
        if (!existing) {
          const conv = await this.conversationsService.create(userId)
          conversationId = conv.id
          isFirstMessage = true
        } else {
          const access = await this.conversationsService.checkAccess(conversationId, userId)
          if (!access) throw new ForbiddenException('Not authorized to access this conversation')
          if (access === 'read') throw new ForbiddenException('Read-only access — cannot send messages')
          const existingMessages = await this.conversationsService.getAnthropicMessages(conversationId)
          isFirstMessage = existingMessages.length === 0
        }
      }

      this.abortControllers.set(conversationId, abortController)
      yield this.formatSSE({ type: 'session', conversationId })

      if (isFirstMessage) {
        const title = ConversationsService.generateTitle(message)
        await this.conversationsService.updateTitle(conversationId, title)
      }

      const history = await this.conversationsService.getAnthropicMessages(conversationId)
      await this.conversationsService.addMessage(conversationId, 'user', message)

      const messages: Anthropic.MessageParam[] = [
        ...(history as Anthropic.MessageParam[]),
        { role: 'user', content: message },
      ]

      const tools = this.toolRegistry.getToolDefinitions()

      // Agent loop: Claude responds, we check stop_reason. If 'tool_use', we execute
      // the requested tools, append results, and call Claude again. Each iteration is
      // one "round". Capped at MAX_ROUNDS (15) to prevent runaway tool loops.
      // The loop persists every message to DB as it goes, so partial conversations
      // survive crashes or cancellations.
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (abortController.signal.aborted) {
          yield this.formatSSE({ type: 'stopped' })
          return
        }

        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: 16384,
          system: await this.buildSystemPrompt(message),
          messages,
          ...(tools.length > 0 ? { tools } : {}),
        })

        const assistantContent: unknown[] = []
        let currentTextBlock: { type: 'text'; text: string } | null = null
        let stopReason: string | null = null

        for await (const event of stream) {
          if (abortController.signal.aborted) {
            const content = [...assistantContent.filter((b) => (b as ContentBlock).type !== 'tool_use')]
            if (currentTextBlock) content.push(currentTextBlock)
            if (content.length > 0) {
              await this.conversationsService.addMessage(conversationId, 'assistant', content)
            }
            yield this.formatSSE({ type: 'stopped' })
            return
          }

          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'text') {
              currentTextBlock = { type: 'text', text: '' }
            } else if (event.content_block.type === 'tool_use') {
              assistantContent.push({
                type: 'tool_use',
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              })
            }
          }

          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta' && currentTextBlock) {
              currentTextBlock.text += event.delta.text
              yield this.formatSSE({ type: 'text', text: event.delta.text })
            }
          }

          if (event.type === 'content_block_stop') {
            if (currentTextBlock) {
              assistantContent.push(currentTextBlock)
              currentTextBlock = null
            }
          }

          if (event.type === 'message_delta') {
            stopReason = event.delta.stop_reason
          }
        }

        const finalMessage = await stream.finalMessage()
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            const idx = assistantContent.findIndex(
              (b) => (b as ContentBlock).type === 'tool_use' && (b as ContentBlock).id === block.id,
            )
            if (idx >= 0) {
              assistantContent[idx] = {
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input,
              }
            }
          }
        }

        // If no tool calls, save and return immediately.
        if (stopReason !== 'tool_use') {
          await this.conversationsService.addMessage(conversationId, 'assistant', assistantContent)
          messages.push({ role: 'assistant', content: assistantContent as Anthropic.ContentBlock[] })
          yield this.formatSSE({ type: 'done' })
          return
        }

        // Tool calls: execute all tools first, then save assistant + results together.
        // This avoids orphaned tool_use blocks if execution crashes or is aborted.
        const toolUseBlocks = assistantContent.filter((b) => (b as ContentBlock).type === 'tool_use') as ContentBlock[]
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const b of toolUseBlocks) {
          if (abortController.signal.aborted) {
            toolResults.push({ type: 'tool_result', tool_use_id: b.id!, content: 'Cancelled by user.' })
            continue
          }

          yield this.formatSSE({
            type: 'tool_start',
            toolCallId: b.id,
            tool: b.name,
            args: safeSummary(b.input),
          })

          const toolInput = await this.prepareToolInput(b.name!, b.input as Record<string, unknown>, userId)
          const result = await this.toolRegistry.execute(b.name!, toolInput, userId)

          let parsedResult: unknown
          try {
            parsedResult = JSON.parse(result)
          } catch {
            parsedResult = result
          }

          const isError = typeof parsedResult === 'object' && parsedResult !== null && 'error' in parsedResult

          yield this.formatSSE({
            type: 'tool_end',
            toolCallId: b.id,
            tool: b.name,
            success: !isError,
            ...(isError ? { error: (parsedResult as { error: string }).error } : { result: parsedResult }),
          })

          toolResults.push({
            type: 'tool_result',
            tool_use_id: b.id!,
            content: result,
            ...(isError && { is_error: true }),
          })
        }

        // Save assistant message and tool results together — no orphan window
        await this.conversationsService.addMessage(conversationId, 'assistant', assistantContent)
        await this.conversationsService.addMessage(conversationId, 'user', toolResults)
        messages.push(
          { role: 'assistant', content: assistantContent as Anthropic.ContentBlock[] },
          { role: 'user', content: toolResults },
        )

        if (abortController.signal.aborted) {
          yield this.formatSSE({ type: 'stopped' })
          return
        }
      }

      yield this.formatSSE({ type: 'max_rounds' })
    } catch (error) {
      if (abortController.signal.aborted) {
        yield this.formatSSE({ type: 'stopped' })
        return
      }
      this.logger.error(`Stream error for conversation ${conversationId}:`, error)
      yield this.formatSSE({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      if (conversationId) {
        this.abortControllers.delete(conversationId)
      }
    }
  }

  async *streamContinue(conversationId: string, userId: string): AsyncGenerator<string> {
    const existing = await this.conversationsService.findById(conversationId)
    if (!existing) {
      yield this.formatSSE({ type: 'error', error: 'Conversation not found' })
      return
    }
    const access = await this.conversationsService.checkAccess(conversationId, userId)
    if (!access) throw new ForbiddenException('Not authorized to access this conversation')
    if (access === 'read') throw new ForbiddenException('Read-only access — cannot continue')

    const history = await this.conversationsService.getAnthropicMessages(conversationId)

    const abortController = new AbortController()
    this.abortControllers.set(conversationId, abortController)

    yield this.formatSSE({ type: 'session', conversationId })

    const messages: Anthropic.MessageParam[] = history as Anthropic.MessageParam[]
    const tools = this.toolRegistry.getToolDefinitions()

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (abortController.signal.aborted) {
          yield this.formatSSE({ type: 'stopped' })
          return
        }

        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: 16384,
          system: await this.buildSystemPrompt(''),
          messages,
          ...(tools.length > 0 ? { tools } : {}),
        })

        const assistantContent: unknown[] = []
        let currentTextBlock: { type: 'text'; text: string } | null = null
        let stopReason: string | null = null

        for await (const event of stream) {
          if (abortController.signal.aborted) {
            yield this.formatSSE({ type: 'stopped' })
            return
          }

          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'text') {
              currentTextBlock = { type: 'text', text: '' }
            } else if (event.content_block.type === 'tool_use') {
              assistantContent.push({
                type: 'tool_use',
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              })
            }
          }

          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta' && currentTextBlock) {
              currentTextBlock.text += event.delta.text
              yield this.formatSSE({ type: 'text', text: event.delta.text })
            }
          }

          if (event.type === 'content_block_stop') {
            if (currentTextBlock) {
              assistantContent.push(currentTextBlock)
              currentTextBlock = null
            }
          }

          if (event.type === 'message_delta') {
            stopReason = event.delta.stop_reason
          }
        }

        const finalMessage = await stream.finalMessage()
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            const idx = assistantContent.findIndex(
              (b) => (b as ContentBlock).type === 'tool_use' && (b as ContentBlock).id === block.id,
            )
            if (idx >= 0) {
              assistantContent[idx] = { type: 'tool_use', id: block.id, name: block.name, input: block.input }
            }
          }
        }

        if (stopReason !== 'tool_use') {
          await this.conversationsService.addMessage(conversationId, 'assistant', assistantContent)
          messages.push({ role: 'assistant', content: assistantContent as Anthropic.ContentBlock[] })
          yield this.formatSSE({ type: 'done' })
          return
        }

        const toolUseBlocks = assistantContent.filter((b) => (b as ContentBlock).type === 'tool_use') as ContentBlock[]
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const b of toolUseBlocks) {
          if (abortController.signal.aborted) {
            toolResults.push({ type: 'tool_result', tool_use_id: b.id!, content: 'Cancelled by user.' })
            continue
          }

          yield this.formatSSE({ type: 'tool_start', toolCallId: b.id, tool: b.name, args: safeSummary(b.input) })

          const toolInput = await this.prepareToolInput(b.name!, b.input as Record<string, unknown>, userId)
          const result = await this.toolRegistry.execute(b.name!, toolInput, userId)
          let parsedResult: unknown
          try {
            parsedResult = JSON.parse(result)
          } catch {
            parsedResult = result
          }
          const isError = typeof parsedResult === 'object' && parsedResult !== null && 'error' in parsedResult

          yield this.formatSSE({
            type: 'tool_end',
            toolCallId: b.id,
            tool: b.name,
            success: !isError,
            ...(isError ? { error: (parsedResult as { error: string }).error } : { result: parsedResult }),
          })

          toolResults.push({
            type: 'tool_result',
            tool_use_id: b.id!,
            content: result,
            ...(isError && { is_error: true }),
          })
        }

        await this.conversationsService.addMessage(conversationId, 'assistant', assistantContent)
        await this.conversationsService.addMessage(conversationId, 'user', toolResults)
        messages.push(
          { role: 'assistant', content: assistantContent as Anthropic.ContentBlock[] },
          { role: 'user', content: toolResults },
        )
      }

      yield this.formatSSE({ type: 'max_rounds' })
    } catch (error) {
      if (abortController.signal.aborted) {
        yield this.formatSSE({ type: 'stopped' })
        return
      }
      this.logger.error(`Continue error for conversation ${conversationId}:`, error)
      yield this.formatSSE({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      this.abortControllers.delete(conversationId)
    }
  }

  stopStream(conversationId: string): boolean {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(conversationId)
      return true
    }
    return false
  }

  private async prepareToolInput(
    toolName: string,
    input: Record<string, unknown>,
    userId: string,
  ): Promise<Record<string, unknown>> {
    if (this.toolRegistry.isSandboxTool(toolName)) {
      const apiKey = await this.settingsService.getDaytonaApiKey(userId)
      return { ...input, _apiKey: apiKey }
    }
    return input
  }

  private async getDatasourceBlock(): Promise<string> {
    if (!this.grafana.isConfigured()) return ''
    if (Date.now() < this.datasourceCacheExpiry && this.datasourceBlock) {
      return this.datasourceBlock
    }
    try {
      const datasources = await this.grafana.listDatasources()
      this.datasourceBlock =
        '\n\n### Available Datasources (pre-fetched)\n```json\n' +
        JSON.stringify(datasources, null, 2) +
        '\n```\nUse these UIDs directly — do not call list_datasources unless you need a refresh.'
      this.datasourceCacheExpiry = Date.now() + 10 * 60 * 1000
    } catch {
      // Grafana unreachable — Claude falls back to calling list_datasources
    }
    return this.datasourceBlock
  }

  private async buildSystemPrompt(userMessage: string): Promise<Anthropic.TextBlockParam[]> {
    const skills = matchSkills(userMessage)
    const datasources = await this.getDatasourceBlock()
    let prompt = SYSTEM_PROMPT + datasources
    if (skills.length > 0) {
      prompt += '\n\n---\n\n## Matched Skills\n\n' + skills.join('\n\n---\n\n')
    }
    return [
      {
        type: 'text',
        text: prompt,
        cache_control: { type: 'ephemeral' },
      },
    ]
  }

  private formatSSE(data: Record<string, unknown>): string {
    return `data: ${JSON.stringify(data)}\n\n`
  }
}
