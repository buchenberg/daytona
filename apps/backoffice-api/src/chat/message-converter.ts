/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: unknown
  is_error?: boolean
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock

interface AssistantUITextPart {
  type: 'text'
  text: string
}

interface AssistantUIToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  argsText: string
  result?: unknown
  isError?: boolean
}

interface AssistantUIToolResultPart {
  type: 'tool-result'
  toolCallId: string
  result: unknown
  isError?: boolean
}

type AssistantUIMessagePart = AssistantUITextPart | AssistantUIToolCallPart | AssistantUIToolResultPart

interface AssistantUIMessage {
  role: 'user' | 'assistant' | 'tool'
  content: AssistantUIMessagePart[]
}

interface StoredMessage {
  role: string
  content: unknown
}

export function convertAnthropicToAssistantUI(messages: StoredMessage[]): AssistantUIMessage[] {
  const result: AssistantUIMessage[] = []
  const toolResults = new Map<string, { content: unknown; isError?: boolean }>()

  // First pass: collect tool results so we can attach them to tool-call parts
  for (const msg of messages) {
    if (msg.role !== 'user') continue
    const blocks = normalizeContent(msg.content)
    for (const block of blocks) {
      if (block.type === 'tool_result') {
        toolResults.set(block.tool_use_id, { content: block.content, isError: block.is_error })
      }
    }
  }

  for (const msg of messages) {
    const blocks = normalizeContent(msg.content)

    if (msg.role === 'user') {
      const allToolResults = blocks.every((b) => b.type === 'tool_result')
      if (allToolResults && blocks.length > 0) {
        // Map pure tool_result messages to "tool" role
        const parts: AssistantUIToolResultPart[] = blocks
          .filter((b): b is AnthropicToolResultBlock => b.type === 'tool_result')
          .map((b) => ({
            type: 'tool-result',
            toolCallId: b.tool_use_id,
            result: b.content,
          }))
        result.push({ role: 'tool', content: parts })
      } else {
        // Regular user message — filter out tool_result blocks
        const parts: AssistantUITextPart[] = blocks
          .filter((b): b is AnthropicTextBlock => b.type === 'text')
          .map((b) => ({ type: 'text', text: b.text }))
        if (parts.length > 0) {
          result.push({ role: 'user', content: parts })
        }
      }
    } else if (msg.role === 'assistant') {
      const parts: AssistantUIMessagePart[] = []
      for (const block of blocks) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_use') {
          const tr = toolResults.get(block.id)
          parts.push({
            type: 'tool-call',
            toolCallId: block.id,
            toolName: block.name,
            args: block.input,
            argsText: JSON.stringify(block.input),
            result: tr?.content,
            ...(tr?.isError && { isError: true }),
          })
        }
      }
      if (parts.length > 0) {
        result.push({ role: 'assistant', content: parts })
      }
    }
  }

  return result
}

function normalizeContent(content: unknown): AnthropicContentBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (Array.isArray(content)) {
    return content as AnthropicContentBlock[]
  }
  return []
}
