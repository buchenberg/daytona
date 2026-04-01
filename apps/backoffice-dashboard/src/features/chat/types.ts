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
  | { type: 'error'; error: string }
  | { type: 'stopped' }
  | { type: 'max_rounds' }
  | { type: 'done' }
