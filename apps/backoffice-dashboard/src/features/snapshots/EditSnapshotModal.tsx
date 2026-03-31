/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useEffect, useState, FormEvent } from 'react'
import { toast } from 'sonner'
import { handleUpdateError, showApiWarnings } from '../../lib/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Switch } from '@dashboard/ui/switch'
import { Snapshot, UpdateSnapshotDto, PatchSnapshotDto } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface EditSnapshotModalProps {
  snapshot: Snapshot | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// No manual form interface - use generated UpdateSnapshotDto directly
export const EditSnapshotModal = ({ snapshot, open, onClose, onSuccess }: EditSnapshotModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({ name: '', hideFromUsers: false, general: false })

  useEffect(() => {
    if (snapshot && open) {
      setFormData({
        name: snapshot.name,
        hideFromUsers: snapshot.hideFromUsers,
        general: snapshot.general,
      })
    }
  }, [snapshot, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!snapshot) return

    try {
      setLoading(true)

      // Validate name
      if (!formData.name || formData.name.trim().length === 0) {
        toast.error('Snapshot name is required')
        return
      }

      if (formData.name.length > 255) {
        toast.error('Snapshot name must be less than 255 characters')
        return
      }

      // Only send changed fields, with preconditions for optimistic concurrency
      const updates: UpdateSnapshotDto = {}
      const preconditions: UpdateSnapshotDto = {}

      if (formData.name !== snapshot.name) {
        updates.name = formData.name
        preconditions.name = snapshot.name
      }
      if (formData.hideFromUsers !== snapshot.hideFromUsers) {
        updates.hideFromUsers = formData.hideFromUsers
        preconditions.hideFromUsers = snapshot.hideFromUsers
      }
      if (formData.general !== snapshot.general) {
        updates.general = formData.general
        preconditions.general = snapshot.general
      }

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save')
        return
      }

      const patchDto: PatchSnapshotDto = { updates }
      if (Object.keys(preconditions).length > 0) {
        patchDto.preconditions = preconditions
      }

      const response = await BackofficeApiClient.updateSnapshot(snapshot.id, patchDto)

      toast.success('Snapshot updated successfully')
      onSuccess()
      onClose()
      showApiWarnings(response)
    } catch (error) {
      handleUpdateError(error, 'Failed to update snapshot')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Snapshot: {snapshot?.name}</DialogTitle>
          <DialogDescription>Make changes to the snapshot configuration</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Python 3.11 Base Image"
            />
            <p className="text-xs text-muted-foreground">Unique name for this snapshot</p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="hideFromUsers"
              checked={formData.hideFromUsers || false}
              onCheckedChange={(checked) => setFormData({ ...formData, hideFromUsers: checked })}
            />
            <Label htmlFor="hideFromUsers" className="cursor-pointer">
              Hide From Users
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, this snapshot won't appear in user selection lists
          </p>

          <div className="flex items-center space-x-2">
            <Switch
              id="general"
              checked={formData.general || false}
              onCheckedChange={(checked) => setFormData({ ...formData, general: checked })}
            />
            <Label htmlFor="general" className="cursor-pointer">
              General (Available to All)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">General snapshots are available to all organizations</p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
