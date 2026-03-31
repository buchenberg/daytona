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
import { Textarea } from '@dashboard/ui/textarea'
import { Sandbox } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import {
  UpdateSandboxDto,
  UpdateSandboxDtoStateEnum,
  UpdateSandboxDtoDesiredStateEnum,
  UpdateSandboxDtoBackupStateEnum,
} from '@daytonaio/backoffice-api-client'

interface BulkEditModalProps {
  sandboxes: Sandbox[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface BulkUpdateFormData {
  state: string
  desiredState: string
  runnerId: string
  errorReason: string
  networkBlockAll: string
  networkAllowList: string
  backupState: string
  backupErrorReason: string
  autoStopInterval: string
  autoArchiveInterval: string
  autoDeleteInterval: string
  pending: string
  authToken: string
}

export const BulkEditModal = ({ sandboxes, open, onClose, onSuccess }: BulkEditModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<BulkUpdateFormData>({
    state: '',
    desiredState: '',
    runnerId: '',
    errorReason: '',
    networkBlockAll: '',
    networkAllowList: '',
    backupState: '',
    backupErrorReason: '',
    autoStopInterval: '',
    autoArchiveInterval: '',
    autoDeleteInterval: '',
    pending: '',
    authToken: '',
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (
      !formData.state &&
      !formData.desiredState &&
      !formData.runnerId &&
      !formData.errorReason &&
      !formData.networkBlockAll &&
      !formData.networkAllowList &&
      !formData.backupState &&
      !formData.backupErrorReason &&
      !formData.autoStopInterval &&
      !formData.autoArchiveInterval &&
      !formData.autoDeleteInterval &&
      !formData.pending &&
      !formData.authToken
    ) {
      toast.error('Please enter at least one value to update')
      return
    }

    try {
      setLoading(true)

      const updates: UpdateSandboxDto = {}
      if (formData.state) updates.state = formData.state as UpdateSandboxDtoStateEnum
      if (formData.desiredState) updates.desiredState = formData.desiredState as UpdateSandboxDtoDesiredStateEnum
      if (formData.runnerId) updates.runnerId = formData.runnerId
      if (formData.errorReason) updates.errorReason = formData.errorReason
      if (formData.networkBlockAll) updates.networkBlockAll = formData.networkBlockAll === 'true'
      if (formData.networkAllowList) updates.networkAllowList = formData.networkAllowList
      if (formData.backupState) updates.backupState = formData.backupState as UpdateSandboxDtoBackupStateEnum
      if (formData.backupErrorReason) updates.backupErrorReason = formData.backupErrorReason
      if (formData.autoStopInterval) updates.autoStopInterval = Number(formData.autoStopInterval)
      if (formData.autoArchiveInterval) updates.autoArchiveInterval = Number(formData.autoArchiveInterval)
      if (formData.autoDeleteInterval) updates.autoDeleteInterval = Number(formData.autoDeleteInterval)
      if (formData.pending) updates.pending = formData.pending === 'true'
      if (formData.authToken) updates.authToken = formData.authToken

      const response = await BackofficeApiClient.bulkUpdateSandboxes({
        ids: sandboxes.map((s) => s.id),
        updates,
      })

      const { successCount, failureCount, warnings } = response

      if (failureCount === 0) {
        toast.success(`Successfully updated ${successCount} sandboxes`)
      } else {
        toast.warning(`${successCount} sandboxes updated, ${failureCount} failed`)
      }

      warnings?.forEach((w: string) => toast.warning(w))

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update sandboxes')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      state: '',
      desiredState: '',
      runnerId: '',
      errorReason: '',
      networkBlockAll: '',
      networkAllowList: '',
      backupState: '',
      backupErrorReason: '',
      autoStopInterval: '',
      autoArchiveInterval: '',
      autoDeleteInterval: '',
      pending: '',
      authToken: '',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Sandboxes</DialogTitle>
          <DialogDescription>
            Editing {sandboxes.length} sandbox{sandboxes.length !== 1 ? 'es' : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Select
                value={formData.state}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, state: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(UpdateSandboxDtoStateEnum).map(([key, value]) => (
                    <SelectItem key={value} value={value}>
                      {key.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desiredState">Desired State</Label>
              <Select
                value={formData.desiredState}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, desiredState: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select desired state (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(UpdateSandboxDtoDesiredStateEnum).map(([key, value]) => (
                    <SelectItem key={value} value={value}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="runnerId">Runner ID</Label>
              <Input
                id="runnerId"
                type="text"
                placeholder="Enter runner ID (optional)"
                value={formData.runnerId}
                onChange={(e) => setFormData((prev) => ({ ...prev, runnerId: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="errorReason">Error Reason</Label>
              <Textarea
                id="errorReason"
                placeholder="Enter error reason (optional)"
                value={formData.errorReason}
                onChange={(e) => setFormData((prev) => ({ ...prev, errorReason: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="networkBlockAll">Network Block All</Label>
              <Select
                value={formData.networkBlockAll}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, networkBlockAll: value }))}
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
              <Label htmlFor="networkAllowList">Network Allow List</Label>
              <Textarea
                id="networkAllowList"
                placeholder="Enter network allow list (optional)"
                value={formData.networkAllowList}
                onChange={(e) => setFormData((prev) => ({ ...prev, networkAllowList: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="backupState">Backup State</Label>
              <Select
                value={formData.backupState}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, backupState: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select backup state (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(UpdateSandboxDtoBackupStateEnum).map(([key, value]) => (
                    <SelectItem key={value} value={value}>
                      {key.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="backupErrorReason">Backup Error Reason</Label>
              <Textarea
                id="backupErrorReason"
                placeholder="Enter backup error reason (optional)"
                value={formData.backupErrorReason}
                onChange={(e) => setFormData((prev) => ({ ...prev, backupErrorReason: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoStopInterval">Auto Stop Interval (minutes)</Label>
              <Input
                id="autoStopInterval"
                type="number"
                min={0}
                placeholder="Enter auto stop interval (optional)"
                value={formData.autoStopInterval}
                onChange={(e) => setFormData((prev) => ({ ...prev, autoStopInterval: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoArchiveInterval">Auto Archive Interval (minutes)</Label>
              <Input
                id="autoArchiveInterval"
                type="number"
                min={0}
                placeholder="Enter auto archive interval (optional)"
                value={formData.autoArchiveInterval}
                onChange={(e) => setFormData((prev) => ({ ...prev, autoArchiveInterval: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoDeleteInterval">Auto Delete Interval (minutes)</Label>
              <Input
                id="autoDeleteInterval"
                type="number"
                min={-1}
                placeholder="Enter auto delete interval (optional)"
                value={formData.autoDeleteInterval}
                onChange={(e) => setFormData((prev) => ({ ...prev, autoDeleteInterval: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pending">Pending</Label>
              <Select
                value={formData.pending}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, pending: value }))}
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
              <Label htmlFor="authToken">Auth Token</Label>
              <Input
                id="authToken"
                type="password"
                placeholder="Enter auth token (optional)"
                value={formData.authToken}
                onChange={(e) => setFormData((prev) => ({ ...prev, authToken: e.target.value }))}
              />
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
              {loading ? 'Updating...' : `Update ${sandboxes.length} Sandboxes`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
