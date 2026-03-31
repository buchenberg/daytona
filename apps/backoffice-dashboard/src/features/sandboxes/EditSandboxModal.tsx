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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Switch } from '@dashboard/ui/switch'
import { Textarea } from '@dashboard/ui/textarea'
import { Sandbox, SandboxDesiredState, SandboxState, BackupState, UpdateSandboxDto, PatchSandboxDto } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface EditSandboxModalProps {
  sandbox: Sandbox | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// No manual form interface - use generated UpdateSandboxDto directly
export const EditSandboxModal = ({ sandbox, open, onClose, onSuccess }: EditSandboxModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({
    state: '',
    desiredState: '',
    runnerId: '',
    errorReason: '',
    networkBlockAll: false,
    networkAllowList: '',
    labels: '',
    backupState: '',
    backupErrorReason: '',
    autoStopInterval: 0,
    autoArchiveInterval: 0,
    autoDeleteInterval: 0,
    pending: false,
    authToken: '',
    cpu: 0,
    mem: 0,
    disk: 0,
    public: false,
    recoverable: false,
  })

  useEffect(() => {
    if (sandbox && open) {
      setFormData({
        state: sandbox.state,
        desiredState: sandbox.desiredState || '',
        runnerId: sandbox.runnerId || '',
        errorReason: sandbox.errorReason || '',
        networkBlockAll: sandbox.networkBlockAll || false,
        networkAllowList: sandbox.networkAllowList || '',
        labels: sandbox.labels ? JSON.stringify(sandbox.labels, null, 2) : '',
        backupState: sandbox.backupState || '',
        backupErrorReason: sandbox.backupErrorReason || '',
        autoStopInterval: sandbox.autoStopInterval ?? 0,
        autoArchiveInterval: sandbox.autoArchiveInterval ?? 0,
        autoDeleteInterval: sandbox.autoDeleteInterval ?? -1,
        pending: sandbox.pending || false,
        authToken: '',
        cpu: sandbox.cpu ?? 0,
        mem: sandbox.mem ?? 0,
        disk: sandbox.disk ?? 0,
        public: sandbox.public || false,
        recoverable: sandbox.recoverable || false,
      })
    }
  }, [sandbox, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!sandbox) return

    try {
      setLoading(true)

      // Only send changed fields, with preconditions for optimistic concurrency
      const updates: UpdateSandboxDto = {}
      const preconditions: UpdateSandboxDto = {}

      if (formData.state !== sandbox.state) {
        updates.state = formData.state
        preconditions.state = sandbox.state
      }
      if (formData.runnerId !== (sandbox.runnerId || '')) {
        updates.runnerId = formData.runnerId || null
        preconditions.runnerId = sandbox.runnerId || null
      }

      // Parse labels JSON
      const labelsStr = sandbox.labels ? JSON.stringify(sandbox.labels, null, 2) : ''
      if (formData.labels !== labelsStr) {
        try {
          updates.labels = formData.labels ? JSON.parse(formData.labels) : {}
        } catch (e) {
          toast.error('Invalid JSON format for labels')
          setLoading(false)
          return
        }
      }

      // Optional fields - only send if provided
      if (formData.desiredState) {
        updates.desiredState = formData.desiredState
        preconditions.desiredState = sandbox.desiredState
      }
      if (formData.errorReason) updates.errorReason = formData.errorReason
      if (formData.networkBlockAll !== undefined) updates.networkBlockAll = formData.networkBlockAll
      if (formData.networkAllowList) updates.networkAllowList = formData.networkAllowList
      if (formData.backupState) {
        updates.backupState = formData.backupState
        preconditions.backupState = sandbox.backupState
      }
      if (formData.backupErrorReason) updates.backupErrorReason = formData.backupErrorReason
      if (formData.autoStopInterval) updates.autoStopInterval = formData.autoStopInterval
      if (formData.autoArchiveInterval) updates.autoArchiveInterval = formData.autoArchiveInterval
      if (formData.autoDeleteInterval) updates.autoDeleteInterval = formData.autoDeleteInterval
      if (formData.pending !== undefined) updates.pending = formData.pending
      if (formData.authToken) updates.authToken = formData.authToken
      if (formData.cpu !== sandbox.cpu) updates.cpu = formData.cpu
      if (formData.mem !== sandbox.mem) updates.mem = formData.mem
      if (formData.disk !== sandbox.disk) updates.disk = formData.disk
      if (formData.public !== sandbox.public) updates.public = formData.public
      if (formData.recoverable !== sandbox.recoverable) updates.recoverable = formData.recoverable

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save')
        return
      }

      const patchDto: PatchSandboxDto = { updates }
      if (Object.keys(preconditions).length > 0) {
        patchDto.preconditions = preconditions
      }

      const response = await BackofficeApiClient.updateSandbox(sandbox.id, patchDto)

      toast.success('Sandbox updated successfully')
      onSuccess()
      onClose()
      showApiWarnings(response)
    } catch (error) {
      handleUpdateError(error, 'Failed to update sandbox')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Sandbox: {sandbox?.name}</DialogTitle>
          <DialogDescription>Make changes to the sandbox configuration</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Read-only context */}
          <div className="rounded-md border p-3 bg-muted/50">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Organization:</span> {sandbox?.organizationId}
              </div>
              <div>
                <span className="text-muted-foreground">Region:</span> {sandbox?.region}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpu">CPU</Label>
              <Input
                id="cpu"
                type="number"
                min={1}
                value={formData.cpu}
                onChange={(e) => setFormData({ ...formData, cpu: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mem">Mem (GiB)</Label>
              <Input
                id="mem"
                type="number"
                min={1}
                value={formData.mem}
                onChange={(e) => setFormData({ ...formData, mem: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disk">Disk (GiB)</Label>
              <Input
                id="disk"
                type="number"
                min={1}
                value={formData.disk}
                onChange={(e) => setFormData({ ...formData, disk: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="public">Public</Label>
            <Switch
              id="public"
              checked={formData.public}
              onCheckedChange={(checked) => setFormData({ ...formData, public: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="recoverable">Recoverable</Label>
            <Switch
              id="recoverable"
              checked={formData.recoverable}
              onCheckedChange={(checked) => setFormData({ ...formData, recoverable: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <Select value={formData.state} onValueChange={(value) => setFormData({ ...formData, state: value })}>
              <SelectTrigger id="state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SandboxState).map((state) => (
                  <SelectItem key={state} value={state}>
                    {state.replace(/_/g, ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desiredState">Desired State *</Label>
            <Select
              value={formData.desiredState}
              onValueChange={(value) => setFormData({ ...formData, desiredState: value })}
            >
              <SelectTrigger id="desiredState">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SandboxDesiredState).map((state) => (
                  <SelectItem key={state} value={state}>
                    {state.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="runnerId">Runner ID</Label>
            <Input
              id="runnerId"
              placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
              value={formData.runnerId}
              onChange={(e) => setFormData({ ...formData, runnerId: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">UUID of the runner this sandbox is assigned to</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="errorReason">Error Reason</Label>
            <Textarea
              id="errorReason"
              rows={2}
              placeholder="Error description"
              maxLength={1000}
              value={formData.errorReason}
              onChange={(e) => setFormData({ ...formData, errorReason: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Error message if sandbox is in error state</p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="networkBlockAll">Network Block All</Label>
            <Switch
              id="networkBlockAll"
              checked={formData.networkBlockAll}
              onCheckedChange={(checked) => setFormData({ ...formData, networkBlockAll: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="networkAllowList">Network Allow List</Label>
            <Textarea
              id="networkAllowList"
              rows={3}
              placeholder="example.com, 8.8.8.8"
              maxLength={5000}
              value={formData.networkAllowList}
              onChange={(e) => setFormData({ ...formData, networkAllowList: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated domains/IPs (only applies when Network Block All is enabled)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="labels">Labels (JSON)</Label>
            <Textarea
              id="labels"
              rows={4}
              placeholder='{"env": "production", "team": "backend"}'
              className="font-mono"
              value={formData.labels}
              onChange={(e) => setFormData({ ...formData, labels: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Key-value pairs in JSON format</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="backupState">Backup State *</Label>
            <Select
              value={formData.backupState}
              onValueChange={(value) => setFormData({ ...formData, backupState: value })}
            >
              <SelectTrigger id="backupState">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BackupState).map((state) => (
                  <SelectItem key={state} value={state}>
                    {state.replace(/_/g, ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="backupErrorReason">Backup Error Reason</Label>
            <Textarea
              id="backupErrorReason"
              rows={2}
              placeholder="Backup error description"
              maxLength={1000}
              value={formData.backupErrorReason}
              onChange={(e) => setFormData({ ...formData, backupErrorReason: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Error message if backup failed</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="autoStopInterval">Auto Stop (min)</Label>
              <Input
                id="autoStopInterval"
                type="number"
                min={0}
                value={formData.autoStopInterval}
                onChange={(e) => setFormData({ ...formData, autoStopInterval: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">0 = disabled</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoArchiveInterval">Auto Archive (min)</Label>
              <Input
                id="autoArchiveInterval"
                type="number"
                min={0}
                value={formData.autoArchiveInterval}
                onChange={(e) => setFormData({ ...formData, autoArchiveInterval: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">0 = disabled</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="autoDeleteInterval">Auto Delete (min)</Label>
            <Input
              id="autoDeleteInterval"
              type="number"
              min={-1}
              value={formData.autoDeleteInterval}
              onChange={(e) => setFormData({ ...formData, autoDeleteInterval: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              -1 = disabled, 0 = delete immediately on stop, &gt; 0 = delete after delay
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="pending">Pending</Label>
              <p className="text-xs text-muted-foreground">Whether the sandbox has pending operations</p>
            </div>
            <Switch
              id="pending"
              checked={formData.pending}
              onCheckedChange={(checked) => setFormData({ ...formData, pending: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authToken">Auth Token</Label>
            <Input
              id="authToken"
              type="password"
              placeholder="Authentication token"
              value={formData.authToken}
              onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Authentication token for sandbox access</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
