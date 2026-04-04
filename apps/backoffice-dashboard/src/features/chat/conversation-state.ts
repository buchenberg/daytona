/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

// Shared conversation ID state, used by adapters that need the current
// conversation ID but don't have access to React context (e.g., feedback
// adapter). Updated by MaliThreadProvider on thread switch.
let currentConversationId: string | undefined

export function setCurrentConversationId(id: string) {
  currentConversationId = id
}

export function getCurrentConversationId(): string | undefined {
  return currentConversationId
}
