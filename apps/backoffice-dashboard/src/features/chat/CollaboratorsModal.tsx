/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect, type FC } from 'react'
import { Users, Plus, X, Trash2 } from 'lucide-react'
import {
  addCollaborator,
  listCollaborators,
  removeCollaborator,
  listBackofficeUsers,
  type CollaboratorInfo,
  type BackofficeUserInfo,
} from './api'

interface CollaboratorsModalProps {
  conversationId: string | null
  open: boolean
  onClose: () => void
}

export const CollaboratorsModal: FC<CollaboratorsModalProps> = ({ conversationId, open, onClose }) => {
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([])
  const [users, setUsers] = useState<BackofficeUserInfo[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [newMode, setNewMode] = useState<'read' | 'write'>('read')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    listBackofficeUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
    if (conversationId) {
      setLoading(true)
      listCollaborators(conversationId)
        .then(setCollaborators)
        .catch(() => setCollaborators([]))
        .finally(() => setLoading(false))
    }
  }, [open, conversationId])

  const existingUserIds = new Set(collaborators.map((c) => c.userId))
  const availableUsers = users.filter((u) => !existingUserIds.has(u.id))

  const handleAdd = async () => {
    if (!conversationId || !selectedUserId) return
    setError('')
    try {
      const added = await addCollaborator(conversationId, selectedUserId, newMode)
      setCollaborators((prev) => [...prev, added])
      setSelectedUserId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add collaborator')
    }
  }

  const handleRemove = async (userId: string) => {
    if (!conversationId) return
    await removeCollaborator(conversationId, userId)
    setCollaborators((prev) => prev.filter((c) => c.userId !== userId))
  }

  const getUserDisplay = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    return user ? (user.name ? `${user.name} (${user.email})` : user.email) : userId
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border rounded-xl shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="font-semibold text-sm">Collaborators</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!conversationId ? (
            <p className="text-sm text-muted-foreground text-center py-4">Select a conversation first</p>
          ) : (
            <>
              <div className="flex gap-2">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select user...</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ? `${u.name} (${u.email})` : u.email}
                    </option>
                  ))}
                </select>
                <select
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value as 'read' | 'write')}
                  className="rounded-md border bg-transparent px-2 py-2 text-sm outline-none"
                >
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                </select>
                <button
                  onClick={handleAdd}
                  disabled={!selectedUserId}
                  className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-9 w-9 shrink-0 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : collaborators.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No collaborators yet</p>
              ) : (
                <div className="space-y-2">
                  {collaborators.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm truncate">{getUserDisplay(c.userId)}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.mode === 'write' ? 'Can edit' : 'Read only'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(c.userId)}
                        className="text-muted-foreground hover:text-destructive ml-2 flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
