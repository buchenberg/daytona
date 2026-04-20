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
import { Separator } from '@dashboard/ui/separator'
import { RegionQuota, UpdateRegionQuotaDto, PatchRegionQuotaDto } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface EditRegionQuotaModalProps {
  regionQuota: RegionQuota | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// Form keeps strings so empty input maps cleanly to "unset / inherit org default" (= null on the wire).
type FormState = {
  totalCpuQuota: string
  totalMemoryQuota: string
  totalDiskQuota: string
  maxCpuPerSandbox: string
  maxMemoryPerSandbox: string
  maxDiskPerSandbox: string
  maxDiskPerNonEphemeralSandbox: string
}

const toFormString = (v: number | null | undefined): string => (v == null ? '' : String(v))

const numberOrUndefined = (v: string): number | undefined => (v === '' ? undefined : Number(v))

// For nullable per-sandbox caps: empty string = explicit null (clear override).
const numberOrNull = (v: string): number | null => (v === '' ? null : Number(v))

export const EditRegionQuotaModal = ({ regionQuota, open, onClose, onSuccess }: EditRegionQuotaModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FormState>({
    totalCpuQuota: '',
    totalMemoryQuota: '',
    totalDiskQuota: '',
    maxCpuPerSandbox: '',
    maxMemoryPerSandbox: '',
    maxDiskPerSandbox: '',
    maxDiskPerNonEphemeralSandbox: '',
  })

  useEffect(() => {
    if (regionQuota && open) {
      setFormData({
        totalCpuQuota: String(regionQuota.totalCpuQuota ?? 0),
        totalMemoryQuota: String(regionQuota.totalMemoryQuota ?? 0),
        totalDiskQuota: String(regionQuota.totalDiskQuota ?? 0),
        maxCpuPerSandbox: toFormString(regionQuota.maxCpuPerSandbox),
        maxMemoryPerSandbox: toFormString(regionQuota.maxMemoryPerSandbox),
        maxDiskPerSandbox: toFormString(regionQuota.maxDiskPerSandbox),
        maxDiskPerNonEphemeralSandbox: toFormString(regionQuota.maxDiskPerNonEphemeralSandbox),
      })
    }
  }, [regionQuota, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!regionQuota) return

    try {
      setLoading(true)

      const updates: UpdateRegionQuotaDto = {}
      const preconditions: UpdateRegionQuotaDto = {}

      // Total quotas (always present, never null)
      const newTotalCpu = numberOrUndefined(formData.totalCpuQuota)
      if (newTotalCpu !== undefined && newTotalCpu !== regionQuota.totalCpuQuota) {
        updates.totalCpuQuota = newTotalCpu
        preconditions.totalCpuQuota = regionQuota.totalCpuQuota
      }
      const newTotalMem = numberOrUndefined(formData.totalMemoryQuota)
      if (newTotalMem !== undefined && newTotalMem !== regionQuota.totalMemoryQuota) {
        updates.totalMemoryQuota = newTotalMem
        preconditions.totalMemoryQuota = regionQuota.totalMemoryQuota
      }
      const newTotalDisk = numberOrUndefined(formData.totalDiskQuota)
      if (newTotalDisk !== undefined && newTotalDisk !== regionQuota.totalDiskQuota) {
        updates.totalDiskQuota = newTotalDisk
        preconditions.totalDiskQuota = regionQuota.totalDiskQuota
      }

      // Per-sandbox caps (nullable; empty input clears override)
      const perSandboxFields = [
        'maxCpuPerSandbox',
        'maxMemoryPerSandbox',
        'maxDiskPerSandbox',
        'maxDiskPerNonEphemeralSandbox',
      ] as const

      for (const field of perSandboxFields) {
        const newValue = numberOrNull(formData[field])
        const oldValue = regionQuota[field] ?? null
        if (newValue !== oldValue) {
          updates[field] = newValue
        }
      }

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save')
        return
      }

      const patchDto: PatchRegionQuotaDto = { updates }
      if (Object.keys(preconditions).length > 0) {
        patchDto.preconditions = preconditions
      }

      const response = await BackofficeApiClient.updateRegionQuota(
        regionQuota.organizationId,
        regionQuota.regionId,
        patchDto,
      )

      toast.success('Region quota updated successfully')
      onSuccess()
      onClose()
      showApiWarnings(response)
    } catch (error) {
      handleUpdateError(error, 'Failed to update region quota')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Region Quota</DialogTitle>
          <DialogDescription>
            Organization: {regionQuota?.organizationName || regionQuota?.organizationId}
            <br />
            Region: {regionQuota?.regionId}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Region Totals</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="totalCpuQuota">CPU (cores)</Label>
                <Input
                  id="totalCpuQuota"
                  type="number"
                  min={0}
                  value={formData.totalCpuQuota}
                  onChange={(e) => setFormData((prev) => ({ ...prev, totalCpuQuota: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalMemoryQuota">Memory (GB)</Label>
                <Input
                  id="totalMemoryQuota"
                  type="number"
                  min={0}
                  value={formData.totalMemoryQuota}
                  onChange={(e) => setFormData((prev) => ({ ...prev, totalMemoryQuota: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalDiskQuota">Disk (GB)</Label>
                <Input
                  id="totalDiskQuota"
                  type="number"
                  min={0}
                  value={formData.totalDiskQuota}
                  onChange={(e) => setFormData((prev) => ({ ...prev, totalDiskQuota: e.target.value }))}
                  required
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Per-Sandbox Caps in this Region</h3>
            <p className="text-xs text-muted-foreground">
              Leave empty to inherit the organization default. <code>0</code> on “non-ephemeral disk” disables
              non-ephemeral sandboxes in this region.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxCpuPerSandbox">Max CPU / sandbox</Label>
                <Input
                  id="maxCpuPerSandbox"
                  type="number"
                  min={1}
                  placeholder="(inherit)"
                  value={formData.maxCpuPerSandbox}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxCpuPerSandbox: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxMemoryPerSandbox">Max Memory / sandbox (GB)</Label>
                <Input
                  id="maxMemoryPerSandbox"
                  type="number"
                  min={1}
                  placeholder="(inherit)"
                  value={formData.maxMemoryPerSandbox}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxMemoryPerSandbox: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDiskPerSandbox">Max Disk / sandbox (GB)</Label>
                <Input
                  id="maxDiskPerSandbox"
                  type="number"
                  min={1}
                  placeholder="(inherit)"
                  value={formData.maxDiskPerSandbox}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxDiskPerSandbox: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDiskPerNonEphemeralSandbox">Max Disk / non-ephemeral (GB)</Label>
                <Input
                  id="maxDiskPerNonEphemeralSandbox"
                  type="number"
                  min={0}
                  placeholder="(fall back to disk cap)"
                  value={formData.maxDiskPerNonEphemeralSandbox}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxDiskPerNonEphemeralSandbox: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
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
