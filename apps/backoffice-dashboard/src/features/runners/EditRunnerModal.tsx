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
import { Runner, RunnerState, UpdateRunnerDto, PatchRunnerDto } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface EditRunnerModalProps {
  runner: Runner | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// No manual form interface - use generated UpdateRunnerDto directly
export const EditRunnerModal = ({ runner, open, onClose, onSuccess }: EditRunnerModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({
    state: RunnerState.READY,
    unschedulable: false,
    draining: false,
    region: '',
    cpu: 0,
    memoryGiB: 0,
    diskGiB: 0,
  })

  useEffect(() => {
    if (runner && open) {
      setFormData({
        state: runner.state,
        unschedulable: runner.unschedulable,
        draining: runner.draining,
        region: runner.region,
        cpu: runner.cpu,
        memoryGiB: runner.memoryGiB,
        diskGiB: runner.diskGiB,
      })
    }
  }, [runner, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!runner) return

    try {
      setLoading(true)

      // Only send changed fields, with preconditions for optimistic concurrency
      const updates: UpdateRunnerDto = {}
      const preconditions: UpdateRunnerDto = {}

      if (formData.state !== runner.state) {
        updates.state = formData.state
        preconditions.state = runner.state
      }
      if (formData.unschedulable !== runner.unschedulable) {
        updates.unschedulable = formData.unschedulable
        preconditions.unschedulable = runner.unschedulable
      }
      if (formData.draining !== runner.draining) {
        updates.draining = formData.draining
        preconditions.draining = runner.draining
      }
      if (formData.region !== runner.region) updates.region = formData.region
      if (formData.cpu !== runner.cpu) updates.cpu = formData.cpu
      if (formData.memoryGiB !== runner.memoryGiB) updates.memoryGiB = formData.memoryGiB
      if (formData.diskGiB !== runner.diskGiB) updates.diskGiB = formData.diskGiB

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save')
        return
      }

      const patchDto: PatchRunnerDto = { updates }
      if (Object.keys(preconditions).length > 0) {
        patchDto.preconditions = preconditions
      }

      const response = await BackofficeApiClient.updateRunner(runner.id, patchDto)

      toast.success('Runner updated successfully')
      onSuccess()
      onClose()
      showApiWarnings(response)
    } catch (error) {
      handleUpdateError(error, 'Failed to update runner')
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
          <DialogTitle>Edit Runner: {runner?.domain}</DialogTitle>
          <DialogDescription>Make changes to the runner configuration</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpu">CPU</Label>
              <Input
                id="cpu"
                type="number"
                min={0}
                value={formData.cpu}
                onChange={(e) => setFormData({ ...formData, cpu: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memoryGiB">Mem (GiB)</Label>
              <Input
                id="memoryGiB"
                type="number"
                min={0}
                value={formData.memoryGiB}
                onChange={(e) => setFormData({ ...formData, memoryGiB: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diskGiB">Disk (GiB)</Label>
              <Input
                id="diskGiB"
                type="number"
                min={0}
                value={formData.diskGiB}
                onChange={(e) => setFormData({ ...formData, diskGiB: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Read-only usage info */}
          <div className="rounded-md border p-3 bg-muted/50">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">CPU:</span> {runner?.currentCpuUsagePercentage?.toFixed(1)}%
              </div>
              <div>
                <span className="text-muted-foreground">Memory:</span>{' '}
                {runner?.currentMemoryUsagePercentage?.toFixed(1)}%
              </div>
              <div>
                <span className="text-muted-foreground">Disk:</span> {runner?.currentDiskUsagePercentage?.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <Select
              value={formData.state}
              onValueChange={(value) => setFormData({ ...formData, state: value as UpdateRunnerDto['state'] })}
            >
              <SelectTrigger id="state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(RunnerState).map((state) => (
                  <SelectItem key={state} value={state}>
                    {state.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Current runner state (INITIALIZING, READY, DISABLED, DECOMMISSIONED, UNRESPONSIVE)
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="unschedulable"
              checked={formData.unschedulable}
              onCheckedChange={(checked) => setFormData({ ...formData, unschedulable: checked })}
            />
            <Label htmlFor="unschedulable" className="cursor-pointer">
              Unschedulable
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, no new sandboxes will be assigned to this runner
          </p>

          <div className="flex items-center space-x-2">
            <Switch
              id="draining"
              checked={formData.draining}
              onCheckedChange={(checked) => setFormData({ ...formData, draining: checked })}
            />
            <Label htmlFor="draining" className="cursor-pointer">
              Draining
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, existing sandboxes will be migrated off this runner
          </p>

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
