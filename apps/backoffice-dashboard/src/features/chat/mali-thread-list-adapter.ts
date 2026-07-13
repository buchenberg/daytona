/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { RemoteThreadListAdapter } from '@assistant-ui/react'
import { toast } from 'sonner'
import { createConversation, listConversations, getConversation, renameConversation, deleteConversation } from './api'
import { MaliThreadProvider } from './MaliThreadProvider'
import { registerKnownConversationId, setLastCreatedConversationId } from './mali-runtime'

interface ThreadMeta {
  updatedAt: string
  pinned: boolean
  inputTokens: number
  isCollaboration: boolean
}

const metaCache = new Map<string, ThreadMeta>()

// Minimal external store so the thread list re-renders on meta changes
// (pin toggles, deletions) — assistant-ui only re-lists on mount.
let metaVersion = 0
const metaListeners = new Set<() => void>()

function bumpMetaVersion(): void {
  metaVersion++
  metaListeners.forEach((listener) => listener())
}

export function subscribeThreadMeta(listener: () => void): () => void {
  metaListeners.add(listener)
  return () => metaListeners.delete(listener)
}

export function getThreadMetaVersion(): number {
  return metaVersion
}

export function getThreadMeta(remoteId: string): ThreadMeta | undefined {
  return metaCache.get(remoteId)
}

export function hasPinnedThreads(): boolean {
  for (const meta of metaCache.values()) if (meta.pinned) return true
  return false
}

export function hasUnpinnedThreads(): boolean {
  for (const meta of metaCache.values()) if (!meta.pinned) return true
  return false
}

export function setCachedThreadPinned(remoteId: string, pinned: boolean): void {
  const meta = metaCache.get(remoteId)
  if (meta) metaCache.set(remoteId, { ...meta, pinned })
  bumpMetaVersion()
}

export const createMaliThreadListAdapter = (): RemoteThreadListAdapter => ({
  async list() {
    try {
      const conversations = await listConversations()
      // Prune entries gone from the server (e.g. deleted in another tab) so
      // section headers never key off threads that are no longer rendered.
      const listedIds = new Set(conversations.map((c) => c.id))
      for (const id of [...metaCache.keys()]) {
        if (!listedIds.has(id)) metaCache.delete(id)
      }
      for (const c of conversations) {
        metaCache.set(c.id, {
          updatedAt: c.updatedAt,
          pinned: c.pinned,
          inputTokens: c.inputTokens,
          isCollaboration: c.isCollaboration,
        })
        registerKnownConversationId(c.id)
      }
      bumpMetaVersion()
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
      metaCache.delete(remoteId)
      bumpMetaVersion()
    } catch (err) {
      console.warn('[mali-threads] Failed to delete conversation:', err)
      toast.error('Failed to delete conversation')
      throw err // re-throw: assistant-ui must not remove the thread from the list
    }
  },

  async initialize() {
    try {
      const conv = await createConversation()
      metaCache.set(conv.id, { updatedAt: conv.createdAt, pinned: false, inputTokens: 0, isCollaboration: false })
      bumpMetaVersion()
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
      metaCache.set(conv.id, {
        updatedAt: conv.updatedAt,
        pinned: conv.pinned,
        inputTokens: conv.inputTokens,
        isCollaboration: !conv.isOwner,
      })
      bumpMetaVersion()
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
