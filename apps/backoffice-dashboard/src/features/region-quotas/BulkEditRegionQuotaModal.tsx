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
import { RegionQuota } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { UpdateRegionQuotaDto } from '@daytonaio/backoffice-api-client'

interface BulkEditRegionQuotaModalProps {
  regionQuotas: RegionQuota[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface BulkUpdateFormData {
  totalCpuQuota: string
  totalMemoryQuota: string
  totalDiskQuota: string
}

export const BulkEditRegionQuotaModal = ({ regionQuotas, open, onClose, onSuccess }: BulkEditRegionQuotaModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<BulkUpdateFormData>({
    totalCpuQuota: '',
    totalMemoryQuota: '',
    totalDiskQuota: '',
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!formData.totalCpuQuota && !formData.totalMemoryQuota && !formData.totalDiskQuota) {
      toast.error('Please enter at least one value to update')
      return
    }

    try {
      setLoading(true)

      const updates: UpdateRegionQuotaDto = {}
      if (formData.totalCpuQuota) updates.totalCpuQuota = Number(formData.totalCpuQuota)
      if (formData.totalMemoryQuota) updates.totalMemoryQuota = Number(formData.totalMemoryQuota)
      if (formData.totalDiskQuota) updates.totalDiskQuota = Number(formData.totalDiskQuota)

      const response = await BackofficeApiClient.bulkUpdateRegionQuotas({
        ids: regionQuotas.map((rq) => ({ organizationId: rq.organizationId, region: rq.regionId })),
        updates,
      })

      const { successCount, failureCount, warnings } = response

      if (failureCount === 0) {
        toast.success(`Successfully updated ${successCount} region quotas`)
      } else {
        toast.warning(`${successCount} region quotas updated, ${failureCount} failed`)
      }

      warnings?.forEach((w: string) => toast.warning(w))

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update region quotas')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      totalCpuQuota: '',
      totalMemoryQuota: '',
      totalDiskQuota: '',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Region Quotas</DialogTitle>
          <DialogDescription>
            Editing {regionQuotas.length} region quota{regionQuotas.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label htmlFor="totalCpuQuota">CPU Quota (cores)</Label>
              <Input
                id="totalCpuQuota"
                type="number"
                min={0}
                placeholder="Enter new CPU quota"
                value={formData.totalCpuQuota}
                onChange={(e) => setFormData((prev) => ({ ...prev, totalCpuQuota: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalMemoryQuota">Memory Quota (GB)</Label>
              <Input
                id="totalMemoryQuota"
                type="number"
                min={0}
                placeholder="Enter new memory quota"
                value={formData.totalMemoryQuota}
                onChange={(e) => setFormData((prev) => ({ ...prev, totalMemoryQuota: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalDiskQuota">Disk Quota (GB)</Label>
              <Input
                id="totalDiskQuota"
                type="number"
                min={0}
                placeholder="Enter new disk quota"
                value={formData.totalDiskQuota}
                onChange={(e) => setFormData((prev) => ({ ...prev, totalDiskQuota: e.target.value }))}
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
              {loading ? 'Updating...' : `Update ${regionQuotas.length} Region Quotas`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
