/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, type FC } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import {
  addCollaborator,
  listCollaborators,
  removeCollaborator,
  listBackofficeUsers,
  type CollaboratorInfo,
} from './api'

interface CollaboratorsViewProps {
  conversationId: string
  onClose: () => void
}

/** Collaborator management for one conversation, shown in place of the chat. */
export const CollaboratorsView: FC<CollaboratorsViewProps> = ({ conversationId, onClose }) => {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [newMode, setNewMode] = useState<'read' | 'write'>('read')
  const queryClient = useQueryClient()
  const collaboratorsKey = ['mali-collaborators', conversationId]

  const { data: users = [] } = useQuery({
    queryKey: ['backoffice-users'],
    queryFn: listBackofficeUsers,
  })
  const { data: collaborators = [], isLoading } = useQuery({
    queryKey: collaboratorsKey,
    queryFn: () => listCollaborators(conversationId),
    retry: false,
  })

  const addMutation = useMutation({
    mutationFn: () => addCollaborator(conversationId, selectedUserId, newMode),
    onSuccess: (added) => {
      queryClient.setQueryData<CollaboratorInfo[]>(collaboratorsKey, (prev = []) => [...prev, added])
      setSelectedUserId('')
    },
  })
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeCollaborator(conversationId, userId),
    onSuccess: (_, userId) => {
      queryClient.setQueryData<CollaboratorInfo[]>(collaboratorsKey, (prev = []) =>
        prev.filter((c) => c.userId !== userId),
      )
    },
  })

  const error = addMutation.error ?? removeMutation.error
  const existingUserIds = new Set(collaborators.map((c) => c.userId))
  const availableUsers = users.filter((u) => !existingUserIds.has(u.id))

  const getUserDisplay = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    return user ? (user.name ? `${user.name} (${user.email})` : user.email) : userId
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to chat
        </Button>
        <h1 className="text-lg font-semibold">Collaborators</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newMode} onValueChange={(v) => setNewMode(v as 'read' | 'write')}>
              <SelectTrigger className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="write">Write</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!selectedUserId || addMutation.isPending}
              className="shrink-0"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error.message}</p>}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : collaborators.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No collaborators yet</p>
          ) : (
            <div className="space-y-2">
              {collaborators.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{getUserDisplay(c.userId)}</div>
                    <div className="text-xs text-muted-foreground">{c.mode === 'write' ? 'Can edit' : 'Read only'}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMutation.mutate(c.userId)}
                    disabled={removeMutation.isPending}
                    className="shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
