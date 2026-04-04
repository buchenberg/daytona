/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

/**
 * Type-safe SSE event protocol for Mali chat streaming.
 * Every event emitted by the backend must match one of these variants.
 * The frontend consumer mirrors this union in types.ts.
 */
export type SSEEvent =
  | { type: 'session'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; toolCallId: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCallId: string; tool: string; success: true; result: unknown }
  | { type: 'tool_end'; toolCallId: string; tool: string; success: false; error: string }
  | { type: 'warning'; message: string }
  | { type: 'done' }
  | { type: 'stopped' }
  | { type: 'max_rounds' }
  | { type: 'error'; error: string }
  | {
      type: 'usage'
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number | null
      cacheCreationTokens: number | null
    }
  | { type: 'stuck_loop'; tool: string; rounds: number }

export function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}
