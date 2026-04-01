/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { RuntimeAdapterProvider, useAui, ExportedMessageRepository } from '@assistant-ui/react'
import type { ThreadHistoryAdapter, ThreadMessageLike } from '@assistant-ui/react'
import { useMemo, type FC, type PropsWithChildren } from 'react'
import { getConversation, type AssistantUIMessage, type AssistantUIMessagePart } from './api'
import { registerKnownConversationId } from './mali-runtime'

// assistant-ui registers threadListItem scope via module augmentation on @assistant-ui/store,
// but TypeScript doesn't resolve the augmentation across nested node_modules.
interface ThreadListItemAccessor {
  threadListItem?: () => {
    getState(): { remoteId?: string; id?: string }
    initialize(): Promise<{ remoteId: string }>
  }
}

function convertPart(part: AssistantUIMessagePart) {
  if (part.type === 'text') return { type: 'text' as const, text: part.text }
  if (part.type === 'tool-call') {
    return {
      type: 'tool-call' as const,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      args: part.args,
      argsText: part.argsText,
      result: part.result,
      isError: part.isError,
    }
  }
  return null
}

// Converts API messages to ThreadMessageLike[], merging consecutive assistant
// messages into one (the Anthropic agent loop stores alternating assistant/tool
// pairs per round — without merging, each round renders as a separate bubble).
function toThreadMessageLikes(messages: AssistantUIMessage[]): ThreadMessageLike[] {
  const result: { role: 'user' | 'assistant'; parts: ReturnType<typeof convertPart>[] }[] = []
  for (const msg of messages) {
    if (msg.role === 'tool') continue
    const parts = msg.content.map(convertPart).filter((p) => p !== null)
    const role = msg.role as 'user' | 'assistant'
    if (role === 'assistant' && result.length > 0 && result[result.length - 1].role === 'assistant') {
      result[result.length - 1].parts.push(...parts)
    } else {
      result.push({ role, parts })
    }
  }
  return result.map((entry) => ({
    role: entry.role,
    content: entry.parts as unknown as ThreadMessageLike['content'],
  }))
}

// Runs inside each thread's context — guaranteed access to remoteId.
// Provides a ThreadHistoryAdapter that loads conversation messages from the API.
export const MaliThreadProvider: FC<PropsWithChildren> = ({ children }) => {
  const aui = useAui() as unknown as ThreadListItemAccessor
  let remoteId: string | undefined
  try {
    remoteId = aui.threadListItem?.()?.getState()?.remoteId
  } catch {
    /* scope not available yet */
  }

  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        if (!remoteId) return { messages: [] }
        registerKnownConversationId(remoteId)
        try {
          const conv = await getConversation(remoteId)
          return ExportedMessageRepository.fromArray(toThreadMessageLikes(conv.messages))
        } catch {
          return { messages: [] }
        }
      },
      async append() {
        /* no-op: backend persists messages during streaming */
      },
    }),
    [remoteId],
  )

  return <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>
}
