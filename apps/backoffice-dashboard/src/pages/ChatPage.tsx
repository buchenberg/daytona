/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AssistantRuntimeProvider, useLocalRuntime, useRemoteThreadListRuntime } from '@assistant-ui/react'
import { ChatLayout } from '../features/chat/ChatLayout'
import { createMaliAdapter } from '../features/chat/mali-runtime'
import { createMaliThreadListAdapter } from '../features/chat/mali-thread-list-adapter'
import '@assistant-ui/react-markdown/styles/dot.css'
import { useMemo } from 'react'

const chatAdapter = createMaliAdapter()
const threadListAdapter = createMaliThreadListAdapter()

function useMaliRuntime() {
  return useLocalRuntime(chatAdapter)
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
        <ChatLayout />
      </AssistantRuntimeProvider>
    </div>
  )
}
