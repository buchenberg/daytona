/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { RemoteThreadListAdapter } from '@assistant-ui/react'
import { toast } from 'sonner'
import { createConversation, listConversations, getConversation, renameConversation, deleteConversation } from './api'
import { MaliThreadProvider } from './MaliThreadProvider'
import { registerKnownConversationId, setLastCreatedConversationId } from './mali-runtime'

const timestampCache = new Map<string, string>()

export function getThreadTimestamp(remoteId: string): string | undefined {
  return timestampCache.get(remoteId)
}

export const createMaliThreadListAdapter = (): RemoteThreadListAdapter => ({
  async list() {
    try {
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
    } catch (err) {
      console.warn('[mali-threads] Failed to list conversations:', err)
      toast.error('Failed to load conversations')
      return { threads: [] }
    }
  },

  async rename(remoteId, newTitle) {
    try {
      await renameConversation(remoteId, newTitle)
    } catch (err) {
      console.warn('[mali-threads] Failed to rename conversation:', err)
      toast.error('Failed to rename conversation')
    }
  },

  async archive() {
    /* required by interface, not used */
  },

  async unarchive() {
    /* required by interface, not used */
  },

  async delete(remoteId) {
    try {
      await deleteConversation(remoteId)
      timestampCache.delete(remoteId)
    } catch (err) {
      console.warn('[mali-threads] Failed to delete conversation:', err)
      toast.error('Failed to delete conversation')
      throw err // re-throw: assistant-ui must not remove the thread from the list
    }
  },

  async initialize() {
    try {
      const conv = await createConversation()
      timestampCache.set(conv.id, conv.createdAt)
      // Register before returning — run() may fire before React re-renders
      // the updated remoteId into unstable_threadId.
      setLastCreatedConversationId(conv.id)
      return {
        remoteId: conv.id,
        externalId: undefined,
      }
    } catch (err) {
      console.warn('[mali-threads] Failed to create conversation:', err)
      toast.error('Failed to create new conversation')
      throw err // re-throw: assistant-ui must know initialization failed
    }
  },

  async generateTitle() {
    const { createAssistantStream } = await import('assistant-stream')
    return createAssistantStream((controller) => {
      controller.close()
    })
  },

  async fetch(remoteId) {
    try {
      const conv = await getConversation(remoteId)
      timestampCache.set(conv.id, conv.updatedAt)
      return {
        status: 'regular' as const,
        remoteId: conv.id,
        title: conv.title,
      }
    } catch (err) {
      console.warn('[mali-threads] Failed to fetch conversation:', err)
      toast.error('Failed to load conversation')
      return {
        status: 'regular' as const,
        remoteId,
        title: 'Untitled',
      }
    }
  },

  unstable_Provider: MaliThreadProvider,
})
