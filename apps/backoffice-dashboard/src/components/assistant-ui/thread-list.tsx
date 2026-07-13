/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ThreadListPrimitive, ThreadListItemPrimitive, useAui } from '@assistant-ui/react'
import { toast } from 'sonner'
import {
  getThreadMeta,
  getThreadMetaVersion,
  hasPinnedThreads,
  hasUnpinnedThreads,
  setCachedThreadPinned,
  subscribeThreadMeta,
} from '../../features/chat/mali-thread-list-adapter'
import { setConversationPinned } from '../../features/chat/api'
import { getRelativeTimeString } from '../../lib/utils'
import { Plus, Trash2, Pencil, Pin, Users } from 'lucide-react'
import {
  useState,
  useRef,
  useEffect,
  useSyncExternalStore,
  createContext,
  useContext,
  type FC,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

/** Provided by ChatLayout: opens the collaborators view for a conversation (null closes it). */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export const ManageCollaboratorsContext = createContext<(conversationId: string | null) => void>(() => {})

/** Re-renders the caller whenever thread meta (pin state, deletions) changes. */
function useThreadMetaVersion(): number {
  return useSyncExternalStore(subscribeThreadMeta, getThreadMetaVersion)
}

// Pinned/Recent grouping uses CSS flex order: assistant-ui controls the DOM
// order of items, so rows and static headers sort into sections via `order`.
const PINNED_HEADER_ORDER = 'order-1'
const PINNED_ITEM_ORDER = 'order-2'
const RECENT_HEADER_ORDER = 'order-3'
const RECENT_ITEM_ORDER = 'order-4'

export const ThreadList: FC = () => {
  const openCollaborators = useContext(ManageCollaboratorsContext)
  useThreadMetaVersion()
  // Headers only make sense while both sections have rows.
  const showSections = hasPinnedThreads() && hasUnpinnedThreads()

  return (
    <ThreadListPrimitive.Root className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b">
        <span className="text-sm font-semibold">Conversations</span>
        <ThreadListPrimitive.New
          className="inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={() => openCollaborators(null)}
        >
          <Plus className="h-4 w-4" />
        </ThreadListPrimitive.New>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {showSections && <SectionHeader className={PINNED_HEADER_ORDER}>Pinned</SectionHeader>}
          {showSections && <SectionHeader className={RECENT_HEADER_ORDER}>Recent</SectionHeader>}
          <ThreadListPrimitive.Items
            components={{
              ThreadListItem,
            }}
          />
        </div>
      </div>
    </ThreadListPrimitive.Root>
  )
}

const SectionHeader: FC<{ className: string; children: string }> = ({ className, children }) => (
  <div className={`px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 ${className}`}>
    {children}
  </div>
)

interface ThreadListItemAccessor {
  threadListItem?: () => {
    getState(): { remoteId?: string; title?: string }
    rename(newTitle: string): void
  }
}

function useThreadRemoteId(): string | undefined {
  const aui = useAui() as unknown as ThreadListItemAccessor
  try {
    return aui.threadListItem?.()?.getState()?.remoteId
  } catch {
    return undefined
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return String(tokens)
}

const actionBtnBase =
  'inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:bg-accent transition-colors'
const actionBtnClass = `${actionBtnBase} hover:text-foreground`
const deleteBtnClass = `${actionBtnBase} hover:text-destructive`

const ThreadListItem: FC = () => {
  const aui = useAui() as unknown as ThreadListItemAccessor
  const remoteId = useThreadRemoteId()
  const openCollaborators = useContext(ManageCollaboratorsContext)
  useThreadMetaVersion()
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const meta = remoteId ? getThreadMeta(remoteId) : undefined
  const sectionOrder = meta?.pinned ? PINNED_ITEM_ORDER : RECENT_ITEM_ORDER

  const startEditing = (e: MouseEvent) => {
    e.stopPropagation()
    const title = aui.threadListItem?.()?.getState()?.title || ''
    setEditTitle(title)
    setEditing(true)
  }

  const commitRename = () => {
    const trimmed = editTitle.trim()
    if (trimmed) {
      aui.threadListItem?.()?.rename(trimmed)
    }
    setEditing(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitRename()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  if (editing) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-border/50 bg-muted ${sectionOrder}`}>
        <input
          ref={inputRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 bg-background border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    )
  }

  return (
    <ThreadListItemPrimitive.Root
      className={`group relative flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-muted aria-[current]:bg-primary/10 aria-[current]:border-l-2 aria-[current]:border-l-primary border-b border-border/50 ${sectionOrder}`}
    >
      <ThreadListItemPrimitive.Trigger className="flex-1 min-w-0 text-left" onClick={() => openCollaborators(null)}>
        <div className="truncate">
          <ThreadListItemPrimitive.Title fallback="New conversation" />
        </div>
        <ThreadMetaLine />
      </ThreadListItemPrimitive.Trigger>
      {/* Hidden on hover — the action overlay (with its pin button) takes this spot */}
      {meta?.pinned && <Pin className="ml-2 h-3 w-3 shrink-0 fill-current text-primary group-hover:hidden" />}

      {/* Hover actions overlay the row's right edge so they never squash the title */}
      <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm group-hover:flex">
        <PinButton />
        <button onClick={startEditing} className={actionBtnClass} title="Rename">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {remoteId && !meta?.isCollaboration && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              openCollaborators(remoteId)
            }}
            className={actionBtnClass}
            title="Collaborators"
          >
            <Users className="h-3.5 w-3.5" />
          </button>
        )}
        <ThreadListItemPrimitive.Delete className={deleteBtnClass} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </ThreadListItemPrimitive.Delete>
      </div>
    </ThreadListItemPrimitive.Root>
  )
}

const ThreadMetaLine: FC = () => {
  const remoteId = useThreadRemoteId()
  if (!remoteId) return null

  const meta = getThreadMeta(remoteId)
  if (!meta) return null

  const { relativeTimeString } = getRelativeTimeString(meta.updatedAt)
  return (
    <div className="text-xs text-muted-foreground/70 mt-0.5">
      {relativeTimeString}
      {meta.inputTokens > 0 && <> · {formatTokens(meta.inputTokens)} tokens</>}
    </div>
  )
}

const PinButton: FC = () => {
  const remoteId = useThreadRemoteId()
  const inFlight = useRef(false)

  const meta = remoteId ? getThreadMeta(remoteId) : undefined
  // Pinning is owner-only, so hide the button on shared threads.
  if (!remoteId || !meta || meta.isCollaboration) return null
  const pinned = meta.pinned

  // setCachedThreadPinned notifies the meta store, so the row re-sections immediately.
  const togglePin = async (e: MouseEvent) => {
    e.stopPropagation()
    if (inFlight.current) return
    inFlight.current = true
    setCachedThreadPinned(remoteId, !pinned)
    try {
      await setConversationPinned(remoteId, !pinned)
      // Re-assert: a concurrent fetch() may have clobbered the optimistic value
      // with the pre-PATCH server state.
      setCachedThreadPinned(remoteId, !pinned)
    } catch {
      setCachedThreadPinned(remoteId, pinned)
      toast.error('Failed to update pin')
    } finally {
      inFlight.current = false
    }
  }

  return (
    <button
      onClick={togglePin}
      title={pinned ? 'Unpin (autodeleted after retention period)' : 'Pin to keep forever'}
      className={actionBtnClass}
    >
      <Pin className={`h-3.5 w-3.5 ${pinned ? 'fill-current text-primary' : ''}`} />
    </button>
  )
}
