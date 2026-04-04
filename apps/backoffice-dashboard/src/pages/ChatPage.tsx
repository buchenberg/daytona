/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AssistantRuntimeProvider, useLocalRuntime, useRemoteThreadListRuntime } from '@assistant-ui/react'
import { ErrorBoundary } from 'react-error-boundary'
import { ChatLayout } from '../features/chat/ChatLayout'
import { ChatErrorFallback } from '../features/chat/ChatErrorBoundary'
import { createMaliAdapter } from '../features/chat/mali-runtime'
import { createMaliThreadListAdapter } from '../features/chat/mali-thread-list-adapter'
import { getSuggestions } from '../features/chat/api'
import { getCurrentConversationId } from '../features/chat/conversation-state'
import '@assistant-ui/react-markdown/styles/dot.css'
import { useMemo } from 'react'

const chatAdapter = createMaliAdapter()
const threadListAdapter = createMaliThreadListAdapter()

function useMaliRuntime() {
  return useLocalRuntime(chatAdapter, {
    adapters: {
      suggestion: {
        generate: async () => {
          if (!getCurrentConversationId()) return []
          try {
            const { suggestions } = await getSuggestions(getCurrentConversationId()!)
            return suggestions.map((prompt) => ({ prompt }))
          } catch {
            return []
          }
        },
      },
    },
  })
}

export function ChatPage() {
  const runtime = useRemoteThreadListRuntime(
    useMemo(
      () => ({
        runtimeHook: useMaliRuntime,
        adapter: threadListAdapter,
      }),
      [],
    ),
  )

  return (
    <div className="h-full">
      <AssistantRuntimeProvider runtime={runtime}>
        <ErrorBoundary FallbackComponent={ChatErrorFallback} onError={(err) => console.error('[mali-boundary]', err)}>
          <ChatLayout />
        </ErrorBoundary>
      </AssistantRuntimeProvider>
    </div>
  )
}
