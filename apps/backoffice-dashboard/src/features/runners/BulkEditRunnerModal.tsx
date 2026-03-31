/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, FormEvent } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Runner } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { UpdateRunnerDto, UpdateRunnerDtoStateEnum } from '@daytonaio/backoffice-api-client'

interface BulkEditRunnerModalProps {
  runners: Runner[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface BulkUpdateFormData {
  state: string
  unschedulable: string
}

export const BulkEditRunnerModal = ({ runners, open, onClose, onSuccess }: BulkEditRunnerModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<BulkUpdateFormData>({
    state: '',
    unschedulable: '',
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!formData.state && !formData.unschedulable) {
      toast.error('Please enter at least one value to update')
      return
    }

    try {
      setLoading(true)

      const updates: UpdateRunnerDto = {}
      if (formData.state) updates.state = formData.state as UpdateRunnerDtoStateEnum
      if (formData.unschedulable) updates.unschedulable = formData.unschedulable === 'true'

      const response = await BackofficeApiClient.bulkUpdateRunners({
        ids: runners.map((r) => r.id),
        updates,
      })

      const { successCount, failureCount, warnings } = response

      if (failureCount === 0) {
        toast.success(`Successfully updated ${successCount} runners`)
      } else {
        toast.warning(`${successCount} runners updated, ${failureCount} failed`)
      }

      warnings?.forEach((w: string) => toast.warning(w))

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update runners')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      state: '',
      unschedulable: '',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Runners</DialogTitle>
          <DialogDescription>
            Editing {runners.length} runner{runners.length !== 1 ? 's' : ''}
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
                  <SelectItem value={UpdateRunnerDtoStateEnum.INITIALIZING}>Initializing</SelectItem>
                  <SelectItem value={UpdateRunnerDtoStateEnum.READY}>Ready</SelectItem>
                  <SelectItem value={UpdateRunnerDtoStateEnum.DISABLED}>Disabled</SelectItem>
                  <SelectItem value={UpdateRunnerDtoStateEnum.DECOMMISSIONED}>Decommissioned</SelectItem>
                  <SelectItem value={UpdateRunnerDtoStateEnum.UNRESPONSIVE}>Unresponsive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unschedulable">Unschedulable</Label>
              <Select
                value={formData.unschedulable}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, unschedulable: value }))}
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
              {loading ? 'Updating...' : `Update ${runners.length} Runners`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
