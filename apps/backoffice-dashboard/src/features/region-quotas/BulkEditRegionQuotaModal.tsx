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
import { Separator } from '@dashboard/ui/separator'
import { RegionQuota } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { UpdateRegionQuotaDto } from '@daytonaio/backoffice-api-client'

interface BulkEditRegionQuotaModalProps {
  regionQuotas: RegionQuota[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// Tri-state per nullable field: leave alone | set to a number | clear (set to null).
type NullableMode = 'unchanged' | 'set' | 'clear'

interface BulkUpdateFormData {
  totalCpuQuota: string
  totalMemoryQuota: string
  totalDiskQuota: string
  maxCpuPerSandbox: string
  maxCpuPerSandboxMode: NullableMode
  maxMemoryPerSandbox: string
  maxMemoryPerSandboxMode: NullableMode
  maxDiskPerSandbox: string
  maxDiskPerSandboxMode: NullableMode
  maxDiskPerNonEphemeralSandbox: string
  maxDiskPerNonEphemeralSandboxMode: NullableMode
}

const initialState: BulkUpdateFormData = {
  totalCpuQuota: '',
  totalMemoryQuota: '',
  totalDiskQuota: '',
  maxCpuPerSandbox: '',
  maxCpuPerSandboxMode: 'unchanged',
  maxMemoryPerSandbox: '',
  maxMemoryPerSandboxMode: 'unchanged',
  maxDiskPerSandbox: '',
  maxDiskPerSandboxMode: 'unchanged',
  maxDiskPerNonEphemeralSandbox: '',
  maxDiskPerNonEphemeralSandboxMode: 'unchanged',
}

export const BulkEditRegionQuotaModal = ({ regionQuotas, open, onClose, onSuccess }: BulkEditRegionQuotaModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<BulkUpdateFormData>(initialState)

  const buildUpdates = (): UpdateRegionQuotaDto => {
    const updates: UpdateRegionQuotaDto = {}
    if (formData.totalCpuQuota) updates.totalCpuQuota = Number(formData.totalCpuQuota)
    if (formData.totalMemoryQuota) updates.totalMemoryQuota = Number(formData.totalMemoryQuota)
    if (formData.totalDiskQuota) updates.totalDiskQuota = Number(formData.totalDiskQuota)

    const nullable = [
      ['maxCpuPerSandbox', formData.maxCpuPerSandboxMode, formData.maxCpuPerSandbox],
      ['maxMemoryPerSandbox', formData.maxMemoryPerSandboxMode, formData.maxMemoryPerSandbox],
      ['maxDiskPerSandbox', formData.maxDiskPerSandboxMode, formData.maxDiskPerSandbox],
      [
        'maxDiskPerNonEphemeralSandbox',
        formData.maxDiskPerNonEphemeralSandboxMode,
        formData.maxDiskPerNonEphemeralSandbox,
      ],
    ] as const

    for (const [field, mode, raw] of nullable) {
      if (mode === 'clear') {
        ;(updates as any)[field] = null
      } else if (mode === 'set' && raw !== '') {
        ;(updates as any)[field] = Number(raw)
      }
    }

    return updates
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const updates = buildUpdates()
    if (Object.keys(updates).length === 0) {
      toast.error('Please enter at least one value to update')
      return
    }

    try {
      setLoading(true)

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

  const handleReset = () => setFormData(initialState)

  const renderNullable = (
    label: string,
    valueKey: 'maxCpuPerSandbox' | 'maxMemoryPerSandbox' | 'maxDiskPerSandbox' | 'maxDiskPerNonEphemeralSandbox',
    modeKey:
      | 'maxCpuPerSandboxMode'
      | 'maxMemoryPerSandboxMode'
      | 'maxDiskPerSandboxMode'
      | 'maxDiskPerNonEphemeralSandboxMode',
    minValue: number,
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={formData[modeKey]}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, [modeKey]: e.target.value as NullableMode }) as BulkUpdateFormData)
          }
        >
          <option value="unchanged">Leave unchanged</option>
          <option value="set">Set to…</option>
          <option value="clear">Clear (inherit)</option>
        </select>
        {formData[modeKey] === 'set' && (
          <Input
            type="number"
            min={minValue}
            placeholder="value"
            className="flex-1"
            value={formData[valueKey]}
            onChange={(e) => setFormData((prev) => ({ ...prev, [valueKey]: e.target.value }) as BulkUpdateFormData)}
          />
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Region Quotas</DialogTitle>
          <DialogDescription>
            Editing {regionQuotas.length} region quota{regionQuotas.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 rounded-md border p-4">
            <h3 className="text-sm font-semibold">Region Totals</h3>
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

          <Separator />

          <div className="space-y-4 rounded-md border p-4">
            <h3 className="text-sm font-semibold">Per-Sandbox Caps</h3>
            <p className="text-xs text-muted-foreground">
              Choose “Clear” to drop the per-region override and inherit the organization default.
            </p>
            {renderNullable('Max CPU / sandbox', 'maxCpuPerSandbox', 'maxCpuPerSandboxMode', 1)}
            {renderNullable('Max Memory / sandbox (GB)', 'maxMemoryPerSandbox', 'maxMemoryPerSandboxMode', 1)}
            {renderNullable('Max Disk / sandbox (GB)', 'maxDiskPerSandbox', 'maxDiskPerSandboxMode', 1)}
            {renderNullable(
              'Max Disk / non-ephemeral (GB)',
              'maxDiskPerNonEphemeralSandbox',
              'maxDiskPerNonEphemeralSandboxMode',
              0,
            )}
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
