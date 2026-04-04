/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { ChatEvent } from './types'
import { parseChatEvent } from './types'

const BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status}: ${body}`)
  }
  return res.json()
}

export async function* streamChat(
  body: { conversationId?: string; message: string; shareToken?: string },
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const json = line.slice(6).trim()
        if (json) {
          try {
            const event = parseChatEvent(JSON.parse(json))
            if (event) {
              yield event
            } else {
              console.warn('[mali-sse] Skipping unrecognized event:', json)
            }
          } catch (e) {
            console.warn('[mali-sse] Skipping malformed SSE data:', json, e)
          }
        }
      }
    }
  }
}

export function stopChat(conversationId: string): Promise<{ success: boolean }> {
  return request('/chat/stop', {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  })
}

export async function* streamContinue(conversationId: string, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${BASE}/chat/continue`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const json = line.slice(6).trim()
        if (json) {
          try {
            const event = parseChatEvent(JSON.parse(json))
            if (event) {
              yield event
            } else {
              console.warn('[mali-sse] Skipping unrecognized event:', json)
            }
          } catch (e) {
            console.warn('[mali-sse] Skipping malformed SSE data:', json, e)
          }
        }
      }
    }
  }
}

// Conversation CRUD

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ConversationWithMessages {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: AssistantUIMessage[]
}

export interface AssistantUIMessage {
  role: 'user' | 'assistant' | 'tool'
  content: AssistantUIMessagePart[]
}

export type AssistantUIMessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      argsText: string
      result?: unknown
      isError?: boolean
    }
  | { type: 'tool-result'; toolCallId: string; result: unknown; isError?: boolean }

export function createConversation(): Promise<{ id: string; title: string; createdAt: string }> {
  return request('/conversations', { method: 'POST' })
}

export function listConversations(limit = 50, offset = 0): Promise<ConversationSummary[]> {
  return request(`/conversations?limit=${limit}&offset=${offset}`)
}

export function getConversation(id: string): Promise<ConversationWithMessages> {
  return request(`/conversations/${id}`)
}

export function renameConversation(id: string, title: string): Promise<{ success: boolean }> {
  return request(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export function deleteConversation(id: string): Promise<{ success: boolean }> {
  return request(`/conversations/${id}`, { method: 'DELETE' })
}

export function rememberFromConversation(
  conversationId: string,
): Promise<{ success: boolean; key?: string; value?: string }> {
  return request(`/chat/remember/${conversationId}`, { method: 'POST' })
}

export function getSuggestions(conversationId: string): Promise<{ suggestions: string[] }> {
  return request(`/chat/suggestions/${conversationId}`)
}

export function resetConversationMessages(id: string, keepCount: number): Promise<{ deleted: number }> {
  return request(`/conversations/${id}/messages?keepCount=${keepCount}`, { method: 'DELETE' })
}

export function compactConversation(conversationId: string): Promise<{ summary: string }> {
  return request(`/chat/compact/${conversationId}`, { method: 'POST' })
}

// Settings

export interface MaliSettings {
  daytonaApiKey: string | null
  githubRepoUrl: string | null
  githubPat: string | null
}

export function getSettings(): Promise<MaliSettings> {
  return request('/settings')
}

export function updateSettings(data: Partial<MaliSettings>): Promise<{ success: boolean }> {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Users (for collaborator picker)

export interface BackofficeUserInfo {
  id: string
  email: string
  name?: string
}

export function listBackofficeUsers(): Promise<BackofficeUserInfo[]> {
  return request('/conversations/users')
}

// Collaborators

export interface CollaboratorInfo {
  id: string
  userId: string
  mode: 'read' | 'write'
  grantedBy: string
  createdAt: string
}

export function addCollaborator(
  conversationId: string,
  userId: string,
  mode: 'read' | 'write',
): Promise<CollaboratorInfo> {
  return request(`/conversations/${conversationId}/collaborators`, {
    method: 'POST',
    body: JSON.stringify({ userId, mode }),
  })
}

export function listCollaborators(conversationId: string): Promise<CollaboratorInfo[]> {
  return request(`/conversations/${conversationId}/collaborators`)
}

export function removeCollaborator(conversationId: string, userId: string): Promise<{ success: boolean }> {
  return request(`/conversations/${conversationId}/collaborators/${userId}`, { method: 'DELETE' })
}
