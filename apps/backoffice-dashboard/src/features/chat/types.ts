/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

export type ChatEvent =
  | { type: 'session'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; toolCallId: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCallId: string; tool: string; success: true; result: unknown }
  | { type: 'tool_end'; toolCallId: string; tool: string; success: false; error: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; error: string }
  | { type: 'stopped' }
  | { type: 'max_rounds' }
  | { type: 'done' }
  | {
      type: 'usage'
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number | null
      cacheCreationTokens: number | null
    }
  | { type: 'stuck_loop'; tool: string; rounds: number }

/** Runtime validation for SSE events. Returns a typed ChatEvent or null for unrecognized shapes. */
export function parseChatEvent(raw: unknown): ChatEvent | null {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) return null
  const obj = raw as Record<string, unknown>

  switch (obj.type) {
    case 'session':
      return typeof obj.conversationId === 'string' ? (obj as ChatEvent) : null
    case 'text':
      return typeof obj.text === 'string' ? (obj as ChatEvent) : null
    case 'tool_start':
      return typeof obj.toolCallId === 'string' && typeof obj.tool === 'string' ? (obj as ChatEvent) : null
    case 'tool_end':
      return typeof obj.toolCallId === 'string' && typeof obj.success === 'boolean' ? (obj as ChatEvent) : null
    case 'warning':
      return typeof obj.message === 'string' ? (obj as ChatEvent) : null
    case 'error':
      return typeof obj.error === 'string' ? (obj as ChatEvent) : null
    case 'usage':
      return typeof obj.inputTokens === 'number' && typeof obj.outputTokens === 'number' ? (obj as ChatEvent) : null
    case 'stuck_loop':
      return typeof obj.tool === 'string' && typeof obj.rounds === 'number' ? (obj as ChatEvent) : null
    case 'stopped':
    case 'max_rounds':
    case 'done':
      return obj as ChatEvent
    default:
      return null
  }
}
