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
import { Separator } from '@dashboard/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { CreateRegionQuotaDto } from '@daytonaio/backoffice-api-client'
import { SANDBOX_CLASSES, SandboxClass } from '../../types/quota-bumps'

interface CreateRegionQuotaModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type FormState = {
  organizationId: string
  regionId: string
  sandboxClass: SandboxClass
  totalCpuQuota: string
  totalMemoryQuota: string
  totalDiskQuota: string
  maxCpuPerSandbox: string
  maxMemoryPerSandbox: string
  maxDiskPerSandbox: string
  maxDiskPerNonEphemeralSandbox: string
}

const initialState: FormState = {
  organizationId: '',
  regionId: '',
  sandboxClass: 'container',
  totalCpuQuota: '',
  totalMemoryQuota: '',
  totalDiskQuota: '',
  maxCpuPerSandbox: '',
  maxMemoryPerSandbox: '',
  maxDiskPerSandbox: '',
  maxDiskPerNonEphemeralSandbox: '',
}

const numberOrUndefined = (v: string): number | undefined => {
  if (v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export const CreateRegionQuotaModal = ({ open, onClose, onSuccess }: CreateRegionQuotaModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FormState>(initialState)

  useEffect(() => {
    if (!open) {
      setFormData(initialState)
    }
  }, [open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!formData.organizationId.trim() || !formData.regionId.trim()) {
      toast.error('Organization ID and Region ID are required')
      return
    }

    const totalCpu = numberOrUndefined(formData.totalCpuQuota)
    const totalMem = numberOrUndefined(formData.totalMemoryQuota)
    const totalDisk = numberOrUndefined(formData.totalDiskQuota)

    if (totalCpu === undefined || totalMem === undefined || totalDisk === undefined) {
      toast.error('Total CPU, Memory, and Disk quotas are required')
      return
    }

    const dto: CreateRegionQuotaDto = {
      organizationId: formData.organizationId.trim(),
      regionId: formData.regionId.trim(),
      sandboxClass: formData.sandboxClass,
      totalCpuQuota: totalCpu,
      totalMemoryQuota: totalMem,
      totalDiskQuota: totalDisk,
      maxCpuPerSandbox: numberOrUndefined(formData.maxCpuPerSandbox) ?? null,
      maxMemoryPerSandbox: numberOrUndefined(formData.maxMemoryPerSandbox) ?? null,
      maxDiskPerSandbox: numberOrUndefined(formData.maxDiskPerSandbox) ?? null,
      maxDiskPerNonEphemeralSandbox: numberOrUndefined(formData.maxDiskPerNonEphemeralSandbox) ?? null,
    }

    try {
      setLoading(true)
      await BackofficeApiClient.createRegionQuota(dto)
      toast.success('Region quota created')
      onSuccess()
      onClose()
    } catch (error) {
      handleUpdateError(error, 'Failed to create region quota')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create Region Quota</DialogTitle>
          <DialogDescription>Allocate per-region quotas for an organization.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Target</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organizationId">Organization ID</Label>
                <Input
                  id="organizationId"
                  placeholder="UUID"
                  value={formData.organizationId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, organizationId: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regionId">Region ID</Label>
                <Input
                  id="regionId"
                  placeholder="e.g. us, eu"
                  value={formData.regionId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, regionId: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sandboxClass">Sandbox Class</Label>
                <Select
                  value={formData.sandboxClass}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, sandboxClass: value as SandboxClass }))}
                >
                  <SelectTrigger id="sandboxClass">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SANDBOX_CLASSES.map((sc) => (
                      <SelectItem key={sc} value={sc}>
                        {sc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Region Totals</h3>
            <div className="grid gap-4 sm:grid-cols-2">
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
            <h3 className="text-sm font-semibold">Per-Sandbox Caps (optional)</h3>
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
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
