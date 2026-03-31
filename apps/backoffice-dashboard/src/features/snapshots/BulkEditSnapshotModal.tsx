/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, FormEvent } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Snapshot } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { UpdateSnapshotDto } from '@daytonaio/backoffice-api-client'

interface BulkEditSnapshotModalProps {
  snapshots: Snapshot[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface BulkUpdateFormData {
  name: string
  hideFromUsers: string
  general: string
}

export const BulkEditSnapshotModal = ({ snapshots, open, onClose, onSuccess }: BulkEditSnapshotModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<BulkUpdateFormData>({
    name: '',
    hideFromUsers: '',
    general: '',
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!formData.name && !formData.hideFromUsers && !formData.general) {
      toast.error('Please enter at least one value to update')
      return
    }

    try {
      setLoading(true)

      const updates: UpdateSnapshotDto = {}
      if (formData.name) updates.name = formData.name
      if (formData.hideFromUsers) updates.hideFromUsers = formData.hideFromUsers === 'true'
      if (formData.general) updates.general = formData.general === 'true'

      const response = await BackofficeApiClient.bulkUpdateSnapshots({
        ids: snapshots.map((s) => s.id),
        updates,
      })

      const { successCount, failureCount, warnings } = response

      if (failureCount === 0) {
        toast.success(`Successfully updated ${successCount} snapshots`)
      } else {
        toast.warning(`${successCount} snapshots updated, ${failureCount} failed`)
      }

      warnings?.forEach((w: string) => toast.warning(w))

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update snapshots')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      name: '',
      hideFromUsers: '',
      general: '',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Snapshots</DialogTitle>
          <DialogDescription>
            Editing {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter new name (optional)"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hideFromUsers">Hide From Users</Label>
              <Select
                value={formData.hideFromUsers}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, hideFromUsers: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select value (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="general">General (Available to All)</Label>
              <Select
                value={formData.general}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, general: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select value (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleReset} disabled={loading}>
              Reset
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : `Update ${snapshots.length} Snapshots`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
