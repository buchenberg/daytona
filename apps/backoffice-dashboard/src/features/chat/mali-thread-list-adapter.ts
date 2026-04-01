/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { RemoteThreadListAdapter } from '@assistant-ui/react'
import { createConversation, listConversations, getConversation, renameConversation, deleteConversation } from './api'
import { MaliThreadProvider } from './MaliThreadProvider'
import { registerKnownConversationId, setLastCreatedConversationId } from './mali-runtime'

const timestampCache = new Map<string, string>()

export function getThreadTimestamp(remoteId: string): string | undefined {
  return timestampCache.get(remoteId)
}

export const createMaliThreadListAdapter = (): RemoteThreadListAdapter => ({
  async list() {
    const conversations = await listConversations()
    for (const c of conversations) {
      timestampCache.set(c.id, c.updatedAt)
      registerKnownConversationId(c.id)
    }
    return {
      threads: conversations.map((c) => ({
        status: 'regular' as const,
        remoteId: c.id,
        title: c.title,
      })),
    }
  },

  async rename(remoteId, newTitle) {
    await renameConversation(remoteId, newTitle)
  },

  async archive() {
    /* required by interface, not used */
  },

  async unarchive() {
    /* required by interface, not used */
  },

  async delete(remoteId) {
    await deleteConversation(remoteId)
    timestampCache.delete(remoteId)
  },

  async initialize() {
    const conv = await createConversation()
    timestampCache.set(conv.id, conv.createdAt)
    // Register before returning — run() may fire before React re-renders
    // the updated remoteId into unstable_threadId.
    setLastCreatedConversationId(conv.id)
    return {
      remoteId: conv.id,
      externalId: undefined,
    }
  },

  async generateTitle() {
    const { createAssistantStream } = await import('assistant-stream')
    return createAssistantStream((controller) => {
      controller.close()
    })
  },

  async fetch(remoteId) {
    const conv = await getConversation(remoteId)
    timestampCache.set(conv.id, conv.updatedAt)
    return {
      status: 'regular' as const,
      remoteId: conv.id,
      title: conv.title,
    }
  },

  unstable_Provider: MaliThreadProvider,
})
