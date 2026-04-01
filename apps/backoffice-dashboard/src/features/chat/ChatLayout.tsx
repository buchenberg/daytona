/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useAui } from '@assistant-ui/react'
import { Thread } from '../../components/assistant-ui/thread'
import { ThreadList } from '../../components/assistant-ui/thread-list'
import { SettingsPanel } from './SettingsPanel'
import { CollaboratorsModal } from './CollaboratorsModal'
import { SidebarTrigger } from '@dashboard/ui/sidebar'
import { Settings, Users, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { useState, type FC } from 'react'

interface ThreadAccessor {
  threadListItem?: () => { getState(): { remoteId?: string } }
}

function useCurrentConversationId(): string | null {
  try {
    const aui = useAui() as unknown as ThreadAccessor
    return aui.threadListItem?.()?.getState()?.remoteId ?? null
  } catch {
    return null
  }
}

export const ChatLayout: FC = () => {
  const conversationId = useCurrentConversationId()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-full bg-background relative overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`
          fixed md:relative z-40 md:z-auto
          w-64 border-r flex-shrink-0 flex flex-col bg-background h-full overflow-hidden
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="flex-1 min-h-0">
          <ThreadList />
        </div>
        <div className="flex items-center gap-1 px-3 py-2 border-t">
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollaboratorsOpen(true)}
            className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Collaborators"
          >
            <Users className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center h-12 px-3 border-b md:hidden">
          <SidebarTrigger className="p-2" />
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <span className="ml-2 text-sm font-semibold">Mali</span>
        </div>

        <div className="flex-1 min-h-0">
          <Thread />
        </div>
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CollaboratorsModal
        conversationId={conversationId}
        open={collaboratorsOpen}
        onClose={() => setCollaboratorsOpen(false)}
      />
    </div>
  )
}
