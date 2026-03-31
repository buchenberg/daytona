/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useEffect, useState, FormEvent } from 'react'
import { toast } from 'sonner'
import { handleUpdateError } from '../../lib/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { RegionQuota, UpdateRegionQuotaDto, PatchRegionQuotaDto } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface EditRegionQuotaModalProps {
  regionQuota: RegionQuota | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// No manual form interface - use generated UpdateRegionQuotaDto directly
export const EditRegionQuotaModal = ({ regionQuota, open, onClose, onSuccess }: EditRegionQuotaModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({
    totalCpuQuota: 0,
    totalMemoryQuota: 0,
    totalDiskQuota: 0,
  })

  useEffect(() => {
    if (regionQuota && open) {
      setFormData({
        totalCpuQuota: regionQuota.totalCpuQuota || 0,
        totalMemoryQuota: regionQuota.totalMemoryQuota || 0,
        totalDiskQuota: regionQuota.totalDiskQuota || 0,
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

      if (formData.totalCpuQuota !== regionQuota.totalCpuQuota) {
        updates.totalCpuQuota = Number(formData.totalCpuQuota)
        preconditions.totalCpuQuota = regionQuota.totalCpuQuota
      }
      if (formData.totalMemoryQuota !== regionQuota.totalMemoryQuota) {
        updates.totalMemoryQuota = Number(formData.totalMemoryQuota)
        preconditions.totalMemoryQuota = regionQuota.totalMemoryQuota
      }
      if (formData.totalDiskQuota !== regionQuota.totalDiskQuota) {
        updates.totalDiskQuota = Number(formData.totalDiskQuota)
        preconditions.totalDiskQuota = regionQuota.totalDiskQuota
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
    } catch (error) {
      handleUpdateError(error, 'Failed to update region quota')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Region Quota</DialogTitle>
          <DialogDescription>
            Organization: {regionQuota?.organizationName || regionQuota?.organizationId}
            <br />
            Region: {regionQuota?.regionId}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="totalCpuQuota">CPU Quota (cores)</Label>
            <Input
              id="totalCpuQuota"
              type="number"
              min={0}
              value={formData.totalCpuQuota || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, totalCpuQuota: Number(e.target.value) }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalMemoryQuota">Memory Quota (GB)</Label>
            <Input
              id="totalMemoryQuota"
              type="number"
              min={0}
              value={formData.totalMemoryQuota || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, totalMemoryQuota: Number(e.target.value) }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalDiskQuota">Disk Quota (GB)</Label>
            <Input
              id="totalDiskQuota"
              type="number"
              min={0}
              value={formData.totalDiskQuota || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, totalDiskQuota: Number(e.target.value) }))}
              required
            />
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
