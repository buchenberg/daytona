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
import { Organization } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { UpdateOrganizationDto } from '@daytonaio/backoffice-api-client'

interface BulkEditOrganizationModalProps {
  organizations: Organization[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface BulkUpdateFormData {
  name: string
  suspended: string
  telemetryEnabled: string
  maxCpuPerSandbox: string
  maxMemoryPerSandbox: string
  maxDiskPerSandbox: string
  maxSnapshotSize: string
  snapshotQuota: string
  volumeQuota: string
  sandboxLimitedNetworkEgress: string
}

export const BulkEditOrganizationModal = ({
  organizations,
  open,
  onClose,
  onSuccess,
}: BulkEditOrganizationModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<BulkUpdateFormData>({
    name: '',
    suspended: '',
    telemetryEnabled: '',
    maxCpuPerSandbox: '',
    maxMemoryPerSandbox: '',
    maxDiskPerSandbox: '',
    maxSnapshotSize: '',
    snapshotQuota: '',
    volumeQuota: '',
    sandboxLimitedNetworkEgress: '',
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (
      !formData.name &&
      !formData.suspended &&
      !formData.telemetryEnabled &&
      !formData.maxCpuPerSandbox &&
      !formData.maxMemoryPerSandbox &&
      !formData.maxDiskPerSandbox &&
      !formData.maxSnapshotSize &&
      !formData.snapshotQuota &&
      !formData.volumeQuota &&
      !formData.sandboxLimitedNetworkEgress
    ) {
      toast.error('Please enter at least one value to update')
      return
    }

    try {
      setLoading(true)

      const updates: UpdateOrganizationDto = {}
      if (formData.name) updates.name = formData.name
      if (formData.suspended) updates.suspended = formData.suspended === 'true'
      if (formData.telemetryEnabled) updates.telemetryEnabled = formData.telemetryEnabled === 'true'
      if (formData.maxCpuPerSandbox) updates.maxCpuPerSandbox = Number(formData.maxCpuPerSandbox)
      if (formData.maxMemoryPerSandbox) updates.maxMemoryPerSandbox = Number(formData.maxMemoryPerSandbox)
      if (formData.maxDiskPerSandbox) updates.maxDiskPerSandbox = Number(formData.maxDiskPerSandbox)
      if (formData.maxSnapshotSize) updates.maxSnapshotSize = Number(formData.maxSnapshotSize)
      if (formData.snapshotQuota) updates.snapshotQuota = Number(formData.snapshotQuota)
      if (formData.volumeQuota) updates.volumeQuota = Number(formData.volumeQuota)
      if (formData.sandboxLimitedNetworkEgress)
        updates.sandboxLimitedNetworkEgress = formData.sandboxLimitedNetworkEgress === 'true'

      const response = await BackofficeApiClient.bulkUpdateOrganizations({
        ids: organizations.map((o) => o.id),
        updates,
      })

      const { successCount, failureCount, warnings } = response

      if (failureCount === 0) {
        toast.success(`Successfully updated ${successCount} organizations`)
      } else {
        toast.warning(`${successCount} organizations updated, ${failureCount} failed`)
      }

      warnings?.forEach((w: string) => toast.warning(w))

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update organizations')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      name: '',
      suspended: '',
      telemetryEnabled: '',
      maxCpuPerSandbox: '',
      maxMemoryPerSandbox: '',
      maxDiskPerSandbox: '',
      maxSnapshotSize: '',
      snapshotQuota: '',
      volumeQuota: '',
      sandboxLimitedNetworkEgress: '',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Organizations</DialogTitle>
          <DialogDescription>
            Editing {organizations.length} organization{organizations.length !== 1 ? 's' : ''}
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
              <Label htmlFor="suspended">Suspended</Label>
              <Select
                value={formData.suspended}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, suspended: value }))}
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
              <Label htmlFor="telemetryEnabled">Telemetry Enabled</Label>
              <Select
                value={formData.telemetryEnabled}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, telemetryEnabled: value }))}
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
              <Label htmlFor="maxCpuPerSandbox">Max CPU Per Sandbox</Label>
              <Input
                id="maxCpuPerSandbox"
                type="number"
                min={0}
                placeholder="Enter max CPU (optional)"
                value={formData.maxCpuPerSandbox}
                onChange={(e) => setFormData((prev) => ({ ...prev, maxCpuPerSandbox: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxMemoryPerSandbox">Max Memory Per Sandbox (GB)</Label>
              <Input
                id="maxMemoryPerSandbox"
                type="number"
                min={0}
                placeholder="Enter max memory (optional)"
                value={formData.maxMemoryPerSandbox}
                onChange={(e) => setFormData((prev) => ({ ...prev, maxMemoryPerSandbox: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxDiskPerSandbox">Max Disk Per Sandbox (GB)</Label>
              <Input
                id="maxDiskPerSandbox"
                type="number"
                min={0}
                placeholder="Enter max disk (optional)"
                value={formData.maxDiskPerSandbox}
                onChange={(e) => setFormData((prev) => ({ ...prev, maxDiskPerSandbox: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxSnapshotSize">Max Snapshot Size (GB)</Label>
              <Input
                id="maxSnapshotSize"
                type="number"
                min={0}
                placeholder="Enter max snapshot size (optional)"
                value={formData.maxSnapshotSize}
                onChange={(e) => setFormData((prev) => ({ ...prev, maxSnapshotSize: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="snapshotQuota">Snapshot Quota (GB)</Label>
              <Input
                id="snapshotQuota"
                type="number"
                min={0}
                placeholder="Enter snapshot quota (optional)"
                value={formData.snapshotQuota}
                onChange={(e) => setFormData((prev) => ({ ...prev, snapshotQuota: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="volumeQuota">Volume Quota (GB)</Label>
              <Input
                id="volumeQuota"
                type="number"
                min={0}
                placeholder="Enter volume quota (optional)"
                value={formData.volumeQuota}
                onChange={(e) => setFormData((prev) => ({ ...prev, volumeQuota: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sandboxLimitedNetworkEgress">Sandbox Limited Network Egress</Label>
              <Select
                value={formData.sandboxLimitedNetworkEgress}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, sandboxLimitedNetworkEgress: value }))}
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
              {loading ? 'Updating...' : `Update ${organizations.length} Organizations`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
