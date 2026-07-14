import { Injectable, Logger, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic, {
  RateLimitError,
  AuthenticationError,
  BadRequestError,
  APIConnectionError,
  InternalServerError,
} from '@anthropic-ai/sdk'
import { ConversationsService } from './conversations.service'
import { ToolRegistry } from '../tools/tool-registry'
import { GrafanaService } from '../tools/grafana/grafana.service'
import { safeSummary } from '../tools/truncate'
import { SYSTEM_PROMPT } from './system-prompt'
import { matchSkills } from '../skills'
import { MemoryService } from './memory.service'
import { MEMORY_TOOL_DEFINITIONS, MEMORY_TOOL_NAMES } from './memory-tools'
import { formatSSE } from './sse-events'
import { Permissions } from '../common/permissions'

const MAX_ROUNDS = 15
const MAX_IDENTICAL_TOOL_CALLS = 3
const MAX_STREAM_ATTEMPTS = 3
const TOKEN_WARNING_THRESHOLD = 120000
// Output cap per round. Adaptive thinking tokens count against this too,
// so it needs headroom beyond the expected visible output.
const MAX_TOKENS_PER_ROUND = 32768

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
  permissions: Permissions
}

interface StreamRoundOptions {
  conversationId: string
  messages: Anthropic.MessageParam[]
  systemPrompt: Anthropic.TextBlockParam[]
  tools: Anthropic.Tool[]
  abortController: AbortController
  userId: string
  permissions: Permissions
  savePartialOnAbort: boolean
}

/** DJB2 hash — fast, non-cryptographic, sufficient for deduplication. */
function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private readonly client: Anthropic
  private readonly model: string
  private readonly fallbackModel: string
  private readonly suggestionModel: string
  private readonly abortControllers = new Map<string, AbortController>()
  private readonly datasourceBlockCache = new Map<string, { block: string; expiresAt: number }>()

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly toolRegistry: ToolRegistry,
    private readonly grafana: GrafanaService,
    private readonly memoryService: MemoryService,
  ) {
    const apiKey = this.configService.get<string>('mali.anthropicApiKey')
    this.client = new Anthropic({ apiKey })
    this.model = this.configService.get<string>('mali.model') || 'claude-sonnet-4-6'
    this.fallbackModel = this.configService.get<string>('mali.fallbackModel') || 'claude-haiku-4-5-20251001'
    this.suggestionModel = this.configService.get<string>('mali.suggestionModel') || 'claude-haiku-4-5-20251001'
    this.logger.log(`Mali chat service initialized with model: ${this.model}, fallback: ${this.fallbackModel}`)
  }

  // ---------------------------------------------------------------------------
  // Public streaming methods (thin wrappers around executeRounds)
  // ---------------------------------------------------------------------------

  async *streamChat(options: ChatStreamOptions): AsyncGenerator<string> {
    const { message, userId, permissions } = options
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
      yield formatSSE({ type: 'session', conversationId })

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

      yield* this.executeRounds({
        conversationId,
        messages,
        systemPrompt: await this.buildSystemPrompt(message, userId),
        tools: await this.availableTools(userId, permissions),
        abortController,
        userId,
        permissions,
        savePartialOnAbort: true,
      })
    } catch (error) {
      if (abortController.signal.aborted) {
        yield formatSSE({ type: 'stopped' })
        return
      }
      yield formatSSE({ type: 'error', error: this.classifyError(error, conversationId) })
    } finally {
      if (conversationId) {
        this.abortControllers.delete(conversationId)
      }
    }
  }

  async *streamContinue(conversationId: string, userId: string, permissions: Permissions): AsyncGenerator<string> {
    const existing = await this.conversationsService.findById(conversationId)
    if (!existing) {
      yield formatSSE({ type: 'error', error: 'Conversation not found' })
      return
    }
    const access = await this.conversationsService.checkAccess(conversationId, userId)
    if (!access) throw new ForbiddenException('Not authorized to access this conversation')
    if (access === 'read') throw new ForbiddenException('Read-only access — cannot continue')

    const history = await this.conversationsService.getAnthropicMessages(conversationId)

    // Ensure messages end with a user turn — Claude requires this.
    // If the conversation was stopped mid-assistant-response, the last message
    // is an assistant turn. Append a "continue" prompt to make it valid.
    const messages = history as Anthropic.MessageParam[]
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      const continueMsg = 'Please continue where you left off.'
      await this.conversationsService.addMessage(conversationId, 'user', continueMsg)
      messages.push({ role: 'user', content: continueMsg })
    }

    const abortController = new AbortController()
    this.abortControllers.set(conversationId, abortController)

    yield formatSSE({ type: 'session', conversationId })

    try {
      yield* this.executeRounds({
        conversationId,
        messages,
        systemPrompt: await this.buildSystemPrompt('', userId),
        tools: await this.availableTools(userId, permissions),
        abortController,
        userId,
        permissions,
        savePartialOnAbort: false,
      })
    } catch (error) {
      if (abortController.signal.aborted) {
        yield formatSSE({ type: 'stopped' })
        return
      }
      yield formatSSE({ type: 'error', error: this.classifyError(error, conversationId) })
    } finally {
      this.abortControllers.delete(conversationId)
    }
  }

  // ---------------------------------------------------------------------------
  // Core agentic loop (shared between streamChat and streamContinue)
  // ---------------------------------------------------------------------------

  private async *executeRounds(options: StreamRoundOptions): AsyncGenerator<string> {
    const { conversationId, messages, systemPrompt, tools, abortController, userId, permissions, savePartialOnAbort } =
      options

    const toolCallHistory = new Map<string, number>()
    let tokenWarningEmitted = false

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (abortController.signal.aborted) {
        yield formatSSE({ type: 'stopped' })
        return
      }

      // Each round reads the previous rounds from cache instead of re-billing them.
      this.applyHistoryCacheBreakpoint(messages)

      // Token counting on first round and every 5th round (avoid per-round latency)
      if (!tokenWarningEmitted && (round === 0 || round % 5 === 0)) {
        try {
          const tokenCount = await this.client.messages.countTokens({
            model: this.model,
            thinking: { type: 'adaptive' },
            system: systemPrompt,
            messages,
            tools: tools.length > 0 ? tools : undefined,
          })
          if (tokenCount.input_tokens > TOKEN_WARNING_THRESHOLD) {
            yield formatSSE({
              type: 'warning',
              message: `High token usage (${tokenCount.input_tokens} tokens). Consider using /compact or starting a new conversation.`,
            })
            tokenWarningEmitted = true
          }
        } catch {
          // Token counting is best-effort
        }
      }

      // Stream with retry + model fallback (yields SSE events in real-time)
      const assistantContent: unknown[] = []
      let stopReason: string | null = null
      let roundSucceeded = false
      let useFallback = false

      for (let attempt = 0; attempt < MAX_STREAM_ATTEMPTS; attempt++) {
        if (abortController.signal.aborted) {
          yield formatSSE({ type: 'stopped' })
          return
        }

        const currentModel = useFallback || attempt === MAX_STREAM_ATTEMPTS - 1 ? this.fallbackModel : this.model

        // Reset round state on retry
        assistantContent.length = 0
        stopReason = null

        try {
          // The fallback model (Haiku 4.5) supports neither adaptive thinking
          // nor thinking blocks in history, so it gets a stripped request.
          const isPrimaryModel = currentModel === this.model
          const stream = this.client.messages.stream({
            model: currentModel,
            max_tokens: MAX_TOKENS_PER_ROUND,
            ...(isPrimaryModel ? { thinking: { type: 'adaptive' as const, display: 'summarized' as const } } : {}),
            system: systemPrompt,
            messages: isPrimaryModel ? messages : this.stripThinkingBlocks(messages),
            ...(tools.length > 0 ? { tools } : {}),
          })

          let currentTextBlock: { type: 'text'; text: string } | null = null
          let streamedText = false

          // Real-time streaming — each yield goes to the client immediately
          for await (const event of stream) {
            if (abortController.signal.aborted) {
              if (savePartialOnAbort) {
                if (currentTextBlock) assistantContent.push(currentTextBlock)
                if (assistantContent.length > 0) {
                  await this.conversationsService.addMessage(conversationId, 'assistant', assistantContent)
                }
              }
              yield formatSSE({ type: 'stopped' })
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
                streamedText = true
                yield formatSSE({ type: 'text', text: event.delta.text })
              } else if (event.delta.type === 'thinking_delta') {
                yield formatSSE({ type: 'thinking', text: event.delta.thinking })
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

          // Use the final message content verbatim: it carries complete tool
          // inputs and the thinking blocks that must be replayed unchanged on
          // subsequent rounds when thinking is enabled.
          const finalMessage = await stream.finalMessage()

          // Safety classifiers (e.g. on Fable) decline with a successful
          // response; rerun the round on the fallback model instead. If any
          // partial text already reached the client, mark the cutover so the
          // fallback answer doesn't read as a continuation.
          if (finalMessage.stop_reason === 'refusal' && isPrimaryModel) {
            this.logger.warn(`[refusal] conv=${conversationId} round=${round} retrying on ${this.fallbackModel}`)
            if (streamedText) {
              yield formatSSE({
                type: 'text',
                text: '\n\n---\n_The response above was cut short by a safety check — retrying with the fallback model._\n\n',
              })
            }
            useFallback = true
            continue
          }

          assistantContent.length = 0
          assistantContent.push(...finalMessage.content)

          // Log usage + cache metrics
          yield* this.emitUsage(finalMessage, conversationId, round, currentModel)

          if (currentModel !== this.model) {
            this.logger.warn(`[fallback] conv=${conversationId} round=${round} used fallback model ${currentModel}`)
          }

          roundSucceeded = true
          break // Success — exit retry loop
        } catch (error) {
          if (abortController.signal.aborted) {
            yield formatSSE({ type: 'stopped' })
            return
          }

          if (!this.isRetryableError(error) || attempt === MAX_STREAM_ATTEMPTS - 1) {
            throw error
          }

          const delayMs = this.getRetryDelay(error, attempt)
          this.logger.warn(
            `[retry] conv=${conversationId} round=${round} attempt=${attempt + 1}/${MAX_STREAM_ATTEMPTS} ` +
              `model=${currentModel} error=${error instanceof Error ? error.message : String(error)} ` +
              `retrying in ${delayMs}ms` +
              (attempt === MAX_STREAM_ATTEMPTS - 2 ? ` (next attempt uses fallback: ${this.fallbackModel})` : ''),
          )

          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }

      if (!roundSucceeded) throw new Error('Exhausted all retry attempts')

      if (stopReason === 'refusal') {
        // Both models declined — surface it instead of saving an empty turn.
        yield formatSSE({ type: 'error', error: 'The model declined to answer this request.' })
        return
      }

      await this.conversationsService.addMessage(conversationId, 'assistant', assistantContent)
      messages.push({ role: 'assistant', content: assistantContent as Anthropic.ContentBlock[] })

      if (stopReason !== 'tool_use') {
        yield formatSSE({ type: 'done' })
        return
      }

      // Execute tools
      const toolUseBlocks = assistantContent.filter((b) => (b as ContentBlock).type === 'tool_use') as ContentBlock[]
      const toolResults = yield* this.executeTools(toolUseBlocks, abortController, userId, permissions, toolCallHistory)

      await this.conversationsService.addMessage(conversationId, 'user', toolResults)
      messages.push({ role: 'user', content: toolResults })
    }

    yield formatSSE({ type: 'max_rounds' })
  }

  // ---------------------------------------------------------------------------
  // Tool execution (parallel for read-only, sequential for side-effects)
  // ---------------------------------------------------------------------------

  private async *executeTools(
    toolUseBlocks: ContentBlock[],
    abortController: AbortController,
    userId: string,
    permissions: Permissions,
    toolCallHistory: Map<string, number>,
  ): AsyncGenerator<string, Anthropic.ToolResultBlockParam[]> {
    const orderedResults = new Array<Anthropic.ToolResultBlockParam>(toolUseBlocks.length)

    // Partition into read-only (parallelizable) and side-effect (sequential)
    const readOnlyBatch: { block: ContentBlock; index: number }[] = []
    const sideEffectQueue: { block: ContentBlock; index: number }[] = []

    for (let i = 0; i < toolUseBlocks.length; i++) {
      const b = toolUseBlocks[i]
      // Memory tools mutate shared state and are unknown to the registry, so
      // classify them as side-effect explicitly to keep their call order.
      if (!MEMORY_TOOL_NAMES.has(b.name!) && this.toolRegistry.isReadOnlyTool(b.name!)) {
        readOnlyBatch.push({ block: b, index: i })
      } else {
        sideEffectQueue.push({ block: b, index: i })
      }
    }

    // Execute read-only tools in parallel
    if (readOnlyBatch.length > 0) {
      // Emit all tool_start events upfront so UI shows spinners simultaneously
      for (const { block } of readOnlyBatch) {
        if (abortController.signal.aborted) break
        yield formatSSE({
          type: 'tool_start',
          toolCallId: block.id!,
          tool: block.name!,
          args: safeSummary(block.input) as Record<string, unknown>,
        })
      }

      const promises = readOnlyBatch.map(async ({ block, index }) => {
        if (abortController.signal.aborted) {
          return { index, toolResult: this.cancelledResult(block.id!), yieldEvent: null }
        }

        // Stuck-loop detection
        const stuckResult = this.checkStuckLoop(block, toolCallHistory)
        if (stuckResult) {
          return { index, toolResult: stuckResult.toolResult, yieldEvent: stuckResult.yieldEvent }
        }

        return this.executeSingleTool(block, index, userId, permissions)
      })

      const settled = await Promise.allSettled(promises)

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          const { index, toolResult, yieldEvent } = outcome.value
          orderedResults[index] = toolResult
          if (yieldEvent) yield yieldEvent
        } else {
          // Should not happen — executeSingleTool has its own try-catch. Defensive fallback.
          this.logger.error(`Unexpected parallel tool rejection: ${outcome.reason}`)
        }
      }
    }

    // Execute side-effect tools sequentially
    for (const { block, index } of sideEffectQueue) {
      if (abortController.signal.aborted) {
        orderedResults[index] = this.cancelledResult(block.id!)
        continue
      }

      yield formatSSE({
        type: 'tool_start',
        toolCallId: block.id!,
        tool: block.name!,
        args: safeSummary(block.input) as Record<string, unknown>,
      })

      // Stuck-loop detection
      const stuckResult = this.checkStuckLoop(block, toolCallHistory)
      if (stuckResult) {
        orderedResults[index] = stuckResult.toolResult
        yield stuckResult.yieldEvent
        continue
      }

      const { toolResult, yieldEvent } = await this.executeSingleTool(block, index, userId, permissions)
      orderedResults[index] = toolResult
      if (yieldEvent) yield yieldEvent
    }

    return orderedResults.filter(Boolean)
  }

  private async executeSingleTool(
    block: ContentBlock,
    index: number,
    userId: string,
    permissions: Permissions,
  ): Promise<{ index: number; toolResult: Anthropic.ToolResultBlockParam; yieldEvent: string | null }> {
    const result = MEMORY_TOOL_NAMES.has(block.name!)
      ? await this.executeMemoryTool(block.name!, block.input as Record<string, unknown>, userId)
      : await this.toolRegistry.execute(block.name!, block.input as Record<string, unknown>, permissions, userId)

    let parsedResult: unknown
    try {
      parsedResult = JSON.parse(result)
    } catch {
      parsedResult = result
    }

    const isError = typeof parsedResult === 'object' && parsedResult !== null && 'error' in parsedResult

    let yieldEvent: string
    if (isError) {
      yieldEvent = formatSSE({
        type: 'tool_end',
        toolCallId: block.id!,
        tool: block.name!,
        success: false,
        error: (parsedResult as { error: string }).error,
      })
    } else {
      yieldEvent = formatSSE({
        type: 'tool_end',
        toolCallId: block.id!,
        tool: block.name!,
        success: true,
        result: parsedResult,
      })
    }

    const toolResult: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: block.id!,
      content: result,
      ...(isError && { is_error: true }),
    }

    return { index, toolResult, yieldEvent }
  }

  /** Knowledge-base tools are executed directly against MemoryService, not the datasource registry. */
  private async executeMemoryTool(name: string, input: Record<string, unknown>, userId: string): Promise<string> {
    const TOOL_CATEGORIES = ['finding', 'learning', 'infra', 'org']
    try {
      const key = String(input.key ?? '').trim()
      if (!key) return JSON.stringify({ error: 'key is required' })

      // Curated entries are managed by superadmins in the dashboard only.
      const existing = await this.memoryService.findByKey(key)
      if (existing?.category === 'curated') {
        return JSON.stringify({ error: 'This entry is curated — only superadmins can change it.' })
      }

      if (name === 'memory_store') {
        const value = String(input.value ?? '').trim()
        if (!value) return JSON.stringify({ error: 'value is required' })
        const category = TOOL_CATEGORIES.includes(input.category as string) ? (input.category as string) : 'finding'
        await this.memoryService.store(userId, key, value, category)
        return JSON.stringify({ success: true, key })
      }

      const deleted = await this.memoryService.forget(key)
      return JSON.stringify(deleted ? { success: true } : { success: false, note: 'No entry with that key' })
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  private checkStuckLoop(
    block: ContentBlock,
    toolCallHistory: Map<string, number>,
  ): { toolResult: Anthropic.ToolResultBlockParam; yieldEvent: string } | null {
    const signature = `${block.name}:${JSON.stringify(block.input)}`
    const hash = djb2Hash(signature)
    const count = (toolCallHistory.get(hash) ?? 0) + 1
    toolCallHistory.set(hash, count)

    if (count > MAX_IDENTICAL_TOOL_CALLS) {
      return {
        toolResult: {
          type: 'tool_result',
          tool_use_id: block.id!,
          content:
            `This exact tool call (${block.name}) has been made ${count} times with identical arguments. ` +
            'Please try a different approach, modify the query, or explain what you found so far.',
          is_error: true,
        },
        yieldEvent: formatSSE({ type: 'stuck_loop', tool: block.name!, rounds: count }),
      }
    }

    return null
  }

  private cancelledResult(toolUseId: string): Anthropic.ToolResultBlockParam {
    return { type: 'tool_result', tool_use_id: toolUseId, content: 'Cancelled by user.' }
  }

  // ---------------------------------------------------------------------------
  // Retry + fallback helpers
  // ---------------------------------------------------------------------------

  private isRetryableError(error: unknown): boolean {
    if (error instanceof RateLimitError) return true
    if (error instanceof InternalServerError) return true
    if (error instanceof APIConnectionError) return true
    return false
  }

  private getRetryDelay(error: unknown, attempt: number): number {
    if (error instanceof RateLimitError) {
      const headers = (error as any).headers
      const retryAfter = headers?.get?.('retry-after') ?? headers?.['retry-after']
      if (retryAfter) {
        const parsed = parseInt(String(retryAfter), 10)
        if (!isNaN(parsed)) return parsed * 1000
      }
      return 5000
    }
    return Math.min(1000 * 2 ** attempt, 8000)
  }

  // ---------------------------------------------------------------------------
  // Usage / cache metrics logging
  // ---------------------------------------------------------------------------

  private *emitUsage(
    finalMessage: Anthropic.Message,
    conversationId: string,
    round: number,
    model: string,
  ): Generator<string> {
    const usage = finalMessage.usage
    if (!usage) return

    const cacheRead = (usage as any).cache_read_input_tokens ?? 0
    const cacheCreation = (usage as any).cache_creation_input_tokens ?? 0
    const totalInput = usage.input_tokens
    const cacheHitRate =
      totalInput + cacheCreation > 0 ? Math.round((cacheRead / (totalInput + cacheCreation)) * 100) : 0

    this.logger.log(
      `[usage] conv=${conversationId} round=${round} model=${model} ` +
        `input=${totalInput} output=${usage.output_tokens} ` +
        `cache_read=${cacheRead} cache_create=${cacheCreation} hit_rate=${cacheHitRate}%`,
    )

    // Persist the context size of this round so the sidebar can show it.
    // Fire-and-forget — usage stats must not block or fail the stream.
    this.conversationsService
      .updateInputTokens(conversationId, totalInput + cacheRead + cacheCreation)
      .catch((err) => this.logger.warn(`Failed to persist usage for conv=${conversationId}: ${err}`))

    yield formatSSE({
      type: 'usage',
      inputTokens: totalInput,
      outputTokens: usage.output_tokens,
      cacheReadTokens: cacheRead || null,
      cacheCreationTokens: cacheCreation || null,
    })
  }

  // ---------------------------------------------------------------------------
  // Other public methods (suggestions, compaction, stop)
  // ---------------------------------------------------------------------------

  async generateSuggestions(conversationId: string, userId: string): Promise<string[]> {
    const access = await this.conversationsService.checkAccess(conversationId, userId)
    if (!access) throw new ForbiddenException('Not authorized')

    const history = await this.conversationsService.getAnthropicMessages(conversationId)
    if (history.length === 0) return []

    // Last 4 messages, without thinking blocks — the suggestion model runs with thinking off.
    const recentMessages = this.stripThinkingBlocks(history.slice(-4) as Anthropic.MessageParam[])

    try {
      const response = await this.client.messages.create({
        model: this.suggestionModel,
        max_tokens: 256,
        system:
          'You are a production operations assistant. Given the conversation so far, suggest 3 short follow-up prompts the user might want to ask next. Each suggestion should be under 60 characters.',
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                suggestions: { type: 'array', items: { type: 'string' } },
              },
              required: ['suggestions'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          ...recentMessages,
          { role: 'user', content: 'Based on our conversation, suggest 3 follow-up questions I might want to ask.' },
        ],
      })

      const raw = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
      const parsed = JSON.parse(raw) as { suggestions?: unknown[] }
      return Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map(String) : []
    } catch {
      return []
    }
  }

  async compactConversation(conversationId: string, userId: string): Promise<{ summary: string }> {
    const access = await this.conversationsService.checkAccess(conversationId, userId)
    if (!access || access === 'read') throw new ForbiddenException('Cannot modify this conversation')

    const history = await this.conversationsService.getAnthropicMessages(conversationId)
    if (history.length <= 2) return { summary: '' }

    const response = await this.client.messages.create({
      model: this.suggestionModel,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content:
            'Produce a detailed handoff document summarizing this conversation. ' +
            'Start your response with exactly `<!--mali:handoff-->` on its own line, then use this structure:\n\n' +
            '## Conversation Handoff\n\n' +
            '### Key Findings\n- [bullet points of what was discovered]\n\n' +
            '### Tools & Queries Used\n- [tool name]: [what was queried and why]\n\n' +
            '### Data Discovered\n- [key data points, numbers, conclusions]\n\n' +
            '### Decisions Made\n- [any conclusions or actions taken]\n\n' +
            '### Open Questions\n- [unresolved items that need follow-up]\n\n' +
            '### Context for Next Steps\n[brief paragraph on what to do next]\n\n' +
            'Be thorough — this is the only context the next person will have.\n\n' +
            JSON.stringify(history),
        },
      ],
    })
    const summary = response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Delete all messages, insert handoff as user request + assistant summary
    await this.conversationsService.deleteAllMessages(conversationId)
    await this.conversationsService.addMessage(
      conversationId,
      'user',
      'Conversation was compacted. Handoff context follows.',
    )
    await this.conversationsService.addMessage(conversationId, 'assistant', summary)

    return { summary }
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Datasource tools the user may invoke, plus the always-available knowledge-base tools. */
  private async availableTools(userId: string, permissions: Permissions): Promise<Anthropic.Tool[]> {
    return [...(await this.toolRegistry.listAvailableTools(userId, permissions)), ...MEMORY_TOOL_DEFINITIONS]
  }

  /** Remove thinking blocks — required before sending history to a model with thinking off. */
  private stripThinkingBlocks(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
    return messages
      .map((m) =>
        Array.isArray(m.content)
          ? { ...m, content: m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking') }
          : m,
      )
      .filter((m) => typeof m.content === 'string' || m.content.length > 0)
  }

  /**
   * Keep exactly one history cache breakpoint, on the last block of the latest
   * message (the system prompt uses the other three of the four allowed).
   * Mutates in-memory only — messages are persisted before this runs.
   */
  private applyHistoryCacheBreakpoint(messages: Anthropic.MessageParam[]): void {
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (typeof block === 'object' && block !== null && 'cache_control' in block) {
            delete (block as { cache_control?: unknown }).cache_control
          }
        }
      }
    }

    const last = messages[messages.length - 1]
    if (!last) return
    if (typeof last.content === 'string') {
      last.content = [{ type: 'text', text: last.content }]
    }
    if (Array.isArray(last.content) && last.content.length > 0) {
      const lastBlock = last.content[last.content.length - 1] as { cache_control?: { type: 'ephemeral' } }
      lastBlock.cache_control = { type: 'ephemeral' }
    }
  }

  private async getDatasourceBlock(userId: string): Promise<string> {
    if (!(await this.grafana.isEnabledFor(userId))) return ''

    const cached = this.datasourceBlockCache.get(userId)
    if (cached && Date.now() < cached.expiresAt) return cached.block

    try {
      const datasources = await this.grafana.listDatasources(userId)
      const block =
        '\n\n### Available Datasources (pre-fetched)\n```json\n' +
        JSON.stringify(datasources, null, 2) +
        '\n```\nUse these UIDs directly — do not call list_datasources unless you need a refresh.'
      this.datasourceBlockCache.set(userId, { block, expiresAt: Date.now() + 10 * 60 * 1000 })
      return block
    } catch {
      // Grafana unreachable — Claude falls back to calling list_datasources
      return cached?.block ?? ''
    }
  }

  private async buildSystemPrompt(userMessage: string, userId: string): Promise<Anthropic.TextBlockParam[]> {
    const skills = matchSkills(userMessage)
    const datasources = await this.getDatasourceBlock(userId)

    // Multi-block caching, most stable first: base prompt, datasources (10-min
    // TTL cache), memory (changes on knowledge-base writes), then per-message
    // skills last so their churn never invalidates the cached blocks above.
    const blocks: Anthropic.TextBlockParam[] = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ]

    if (datasources) {
      blocks.push({ type: 'text', text: datasources, cache_control: { type: 'ephemeral' } })
    }

    const memoryBlock = await this.memoryService.getPromptBlock()
    if (memoryBlock) {
      blocks.push({ type: 'text', text: memoryBlock, cache_control: { type: 'ephemeral' } })
    }

    if (skills.length > 0) {
      blocks.push({ type: 'text', text: '## Matched Skills\n\n' + skills.join('\n\n---\n\n') })
    }

    return blocks
  }

  private classifyError(error: unknown, conversationId?: string): string {
    if (error instanceof RateLimitError) {
      this.logger.warn(`Rate limited for conversation ${conversationId}`)
      return 'Rate limited — please wait a moment and try again.'
    }
    if (error instanceof AuthenticationError) {
      this.logger.error(`Anthropic auth failed`)
      return 'AI service authentication failed.'
    }
    if (error instanceof BadRequestError) {
      this.logger.error(`Bad request for conversation ${conversationId}:`, (error as Error).message)
      return 'Invalid conversation state. Try starting a new conversation.'
    }
    if (error instanceof APIConnectionError) {
      this.logger.error(`Connection error for conversation ${conversationId}`)
      return 'Connection to AI service lost. Please retry.'
    }
    if (error instanceof InternalServerError) {
      this.logger.error(`Anthropic server error for conversation ${conversationId}:`, (error as Error).message)
      return 'AI service temporarily unavailable. Please retry.'
    }
    this.logger.error(`Unexpected error for conversation ${conversationId}:`, error)
    return 'An unexpected error occurred.'
  }
}
