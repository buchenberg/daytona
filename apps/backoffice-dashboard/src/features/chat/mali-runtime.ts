/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react'
import { streamChat, stopChat, resetConversationMessages } from './api'
import type { ChatEvent } from './types'

type JSONValue = null | string | number | boolean | { readonly [key: string]: JSONValue } | readonly JSONValue[]

interface ToolCallEntry {
  toolCallId: string
  toolName: string
  args: { readonly [key: string]: JSONValue }
  argsText: string
  result?: unknown
  isError?: boolean
}

// unstable_threadId reads threadListItem.remoteId via a React ref, so it
// lags behind by one render. On the first message of a new thread it can be
// undefined or an internal assistant-ui ID.
//
// We solve this by populating knownConversationIds from the thread-list adapter's
// list() and initialize() — so we can tell real backend IDs from internal ones —
// and by setting lastCreatedConversationId in initialize(), which always completes
// before run() fires. The session SSE event also sets it as a secondary source.
let lastCreatedConversationId: string | undefined
const knownConversationIds = new Set<string>()

export function registerKnownConversationId(id: string) {
  knownConversationIds.add(id)
}

/** Called by the thread-list adapter after initialize() creates a conversation. */
export function setLastCreatedConversationId(id: string) {
  lastCreatedConversationId = id
  knownConversationIds.add(id)
}

export const createMaliAdapter = (fixedConversationId?: string): ChatModelAdapter => ({
  async *run({ messages, abortSignal, unstable_threadId }) {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') return

    const textParts = lastMessage.content.filter((p) => p.type === 'text')
    const messageText = textParts.map((p) => ('text' in p ? p.text : '')).join('\n')
    if (!messageText.trim()) return

    // Resolve the real backend conversationId. For existing threads unstable_threadId
    // is correct; for new threads it may be stale — fall back to the ID that
    // initialize() stored in lastCreatedConversationId before run() was called.
    const remoteConversationId =
      fixedConversationId ??
      (knownConversationIds.has(unstable_threadId!) ? unstable_threadId : undefined) ??
      lastCreatedConversationId

    // When editing a previous message, assistant-ui sends a truncated messages array.
    // Sync the backend by deleting messages after the edit point before streaming.
    // The backend no-ops if keepCount >= actual message count (normal sends).
    if (remoteConversationId && messages.length > 1) {
      await resetConversationMessages(remoteConversationId, messages.length - 1).catch(() => {
        /* best-effort — streaming will still work */
      })
    }

    let conversationId: string | undefined = remoteConversationId

    // Ordered parts array preserves the interleaving of text and tool calls as they
    // arrive from the SSE stream. This is critical: Claude may emit text, then a
    // tool call, then more text. If we accumulated text and tools separately, tool
    // badges would all render at the bottom instead of inline where they were called.
    const parts: ({ type: 'text'; text: string } | { type: 'tool-call'; entry: ToolCallEntry })[] = []
    const toolCalls = new Map<string, ToolCallEntry>()

    const appendText = (text: string) => {
      const last = parts[parts.length - 1]
      if (last && last.type === 'text') {
        last.text += text
      } else {
        parts.push({ type: 'text', text })
      }
    }

    // Each yield must be a cumulative snapshot (full replacement, not delta).
    // assistant-ui replaces the entire message content on each yield.
    const buildResult = (): ChatModelRunResult => ({
      content: parts.map((p) => {
        if (p.type === 'text') {
          return { type: 'text' as const, text: p.text }
        }
        return {
          type: 'tool-call' as const,
          toolCallId: p.entry.toolCallId,
          toolName: p.entry.toolName,
          args: p.entry.args,
          argsText: p.entry.argsText,
          result: p.entry.result,
          isError: p.entry.isError,
        }
      }),
    })

    const handleAbort = () => {
      if (conversationId) {
        stopChat(conversationId).catch(() => {
          /* best-effort */
        })
      }
    }
    abortSignal.addEventListener('abort', handleAbort, { once: true })

    try {
      for await (const event of streamChat(
        { conversationId: remoteConversationId, message: messageText },
        abortSignal,
      )) {
        switch (event.type) {
          case 'session': {
            const sessionConvId = (event as Extract<ChatEvent, { type: 'session' }>).conversationId
            conversationId = sessionConvId
            lastCreatedConversationId = sessionConvId
            knownConversationIds.add(sessionConvId)
            break
          }

          case 'text':
            appendText((event as Extract<ChatEvent, { type: 'text' }>).text)
            yield buildResult()
            break

          case 'tool_start': {
            const e = event as Extract<ChatEvent, { type: 'tool_start' }>
            const entry: ToolCallEntry = {
              toolCallId: e.toolCallId,
              toolName: e.tool,
              args: e.args as { readonly [key: string]: JSONValue },
              argsText: JSON.stringify(e.args),
            }
            toolCalls.set(e.toolCallId, entry)
            parts.push({ type: 'tool-call', entry })
            yield buildResult()
            break
          }

          case 'tool_end': {
            const e = event as Extract<ChatEvent, { type: 'tool_end' }>
            const existing = toolCalls.get(e.toolCallId)
            if (existing) {
              existing.result = e.success
                ? (e as Extract<ChatEvent, { type: 'tool_end'; success: true }>).result
                : (e as Extract<ChatEvent, { type: 'tool_end'; success: false }>).error
              existing.isError = !e.success
            }
            yield buildResult()
            break
          }

          case 'error': {
            const e = event as Extract<ChatEvent, { type: 'error' }>
            yield {
              content: [{ type: 'text' as const, text: `Error: ${e.error}` }],
              status: { type: 'incomplete' as const, reason: 'error' as const },
            }
            return
          }

          case 'stopped':
            yield {
              ...buildResult(),
              status: { type: 'incomplete' as const, reason: 'cancelled' as const },
            }
            return

          case 'done':
            yield buildResult()
            return

          case 'max_rounds':
            yield {
              ...buildResult(),
              status: { type: 'incomplete' as const, reason: 'length' as const },
            }
            return
        }
      }
    } finally {
      abortSignal.removeEventListener('abort', handleAbort)
    }
  },
})
