/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ThreadListPrimitive, ThreadListItemPrimitive, useAui } from '@assistant-ui/react'
import { getThreadTimestamp } from '../../features/chat/mali-thread-list-adapter'
import { getRelativeTimeString } from '../../lib/utils'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useState, useRef, useEffect, type FC, type KeyboardEvent, type MouseEvent } from 'react'

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b">
        <span className="text-sm font-semibold">Conversations</span>
        <ThreadListPrimitive.New className="inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Plus className="h-4 w-4" />
        </ThreadListPrimitive.New>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ThreadListPrimitive.Items
          components={{
            ThreadListItem,
          }}
        />
      </div>
    </ThreadListPrimitive.Root>
  )
}

interface ThreadListItemAccessor {
  threadListItem?: () => {
    getState(): { remoteId?: string; title?: string }
    rename(newTitle: string): void
  }
}

const ThreadListItem: FC = () => {
  const aui = useAui() as unknown as ThreadListItemAccessor
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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
      <div className="flex items-center gap-2 px-3 py-2 text-sm border-b border-border/50 bg-muted">
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
    <ThreadListItemPrimitive.Root className="group flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted data-[current]:bg-muted border-b border-border/50">
      <ThreadListItemPrimitive.Trigger className="flex-1 min-w-0 text-left">
        <div className="truncate">
          <ThreadListItemPrimitive.Title fallback="New conversation" />
        </div>
        <ThreadTimestamp />
      </ThreadListItemPrimitive.Trigger>
      <button
        onClick={startEditing}
        className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center rounded-md h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex-shrink-0"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <ThreadListItemPrimitive.Delete className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center rounded-md h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-muted transition-all flex-shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </ThreadListItemPrimitive.Delete>
    </ThreadListItemPrimitive.Root>
  )
}

const ThreadTimestamp: FC = () => {
  const aui = useAui() as unknown as ThreadListItemAccessor
  let remoteId: string | undefined
  try {
    remoteId = aui.threadListItem?.()?.getState()?.remoteId
  } catch {
    return null
  }
  if (!remoteId) return null

  const timestamp = getThreadTimestamp(remoteId)
  if (!timestamp) return null

  const { relativeTimeString } = getRelativeTimeString(timestamp)
  return <div className="text-xs text-muted-foreground/70 mt-0.5">{relativeTimeString}</div>
}
