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
import { Switch } from '@dashboard/ui/switch'
import { Separator } from '@dashboard/ui/separator'
import { Organization, UpdateOrganizationDto, PatchOrganizationDto } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface EditOrganizationModalProps {
  organization: Organization | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// No manual form interface - use generated UpdateOrganizationDto directly
// Note: Form state uses string values for numeric fields; converted to numbers before sending to API
export const EditOrganizationModal = ({ organization, open, onClose, onSuccess }: EditOrganizationModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    suspended: false,
    suspendedUntil: '',
    defaultRegionId: '',
    telemetryEnabled: false,
    maxCpuPerSandbox: '',
    maxMemoryPerSandbox: '',
    maxDiskPerSandbox: '',
    maxSnapshotSize: '',
    snapshotQuota: '',
    volumeQuota: '',
    sandboxLimitedNetworkEgress: false,
    snapshotDeactivationTimeoutMinutes: '',
    authenticatedRateLimit: '',
    sandboxCreateRateLimit: '',
    sandboxLifecycleRateLimit: '',
    authenticatedRateLimitTtlSeconds: '',
    sandboxCreateRateLimitTtlSeconds: '',
    sandboxLifecycleRateLimitTtlSeconds: '',
  })

  useEffect(() => {
    if (organization && open) {
      const nullableToString = (v: number | null | undefined): string => (v == null ? '' : String(v))
      setFormData({
        name: organization.name,
        suspended: organization.suspended,
        suspendedUntil: organization.suspendedUntil
          ? typeof organization.suspendedUntil === 'string'
            ? (organization.suspendedUntil as string).split('T')[0]
            : new Date(organization.suspendedUntil).toISOString().split('T')[0]
          : '',
        defaultRegionId: organization.defaultRegionId || '',
        telemetryEnabled: organization.telemetryEnabled,
        maxCpuPerSandbox: organization.maxCpuPerSandbox ?? '',
        maxMemoryPerSandbox: organization.maxMemoryPerSandbox ?? '',
        maxDiskPerSandbox: organization.maxDiskPerSandbox ?? '',
        maxSnapshotSize: organization.maxSnapshotSize ?? '',
        snapshotQuota: organization.snapshotQuota ?? '',
        volumeQuota: organization.volumeQuota ?? '',
        sandboxLimitedNetworkEgress: organization.sandboxLimitedNetworkEgress,
        snapshotDeactivationTimeoutMinutes: (organization as any).snapshotDeactivationTimeoutMinutes ?? '',
        authenticatedRateLimit: nullableToString(organization.authenticatedRateLimit),
        sandboxCreateRateLimit: nullableToString(organization.sandboxCreateRateLimit),
        sandboxLifecycleRateLimit: nullableToString(organization.sandboxLifecycleRateLimit),
        authenticatedRateLimitTtlSeconds: nullableToString(organization.authenticatedRateLimitTtlSeconds),
        sandboxCreateRateLimitTtlSeconds: nullableToString(organization.sandboxCreateRateLimitTtlSeconds),
        sandboxLifecycleRateLimitTtlSeconds: nullableToString(organization.sandboxLifecycleRateLimitTtlSeconds),
      })
    }
  }, [organization, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!organization) return

    try {
      setLoading(true)

      // Validate name
      if (!formData.name || formData.name.trim().length === 0) {
        toast.error('Organization name is required')
        return
      }

      if (formData.name.length > 255) {
        toast.error('Organization name must be less than 255 characters')
        return
      }

      // Only send changed fields, with preconditions for optimistic concurrency
      const updates: UpdateOrganizationDto = {}
      const preconditions: UpdateOrganizationDto = {}

      if (formData.name !== organization.name) {
        updates.name = formData.name
        preconditions.name = organization.name
      }
      if (formData.suspended !== organization.suspended) {
        updates.suspended = formData.suspended
        preconditions.suspended = organization.suspended
      }
      const orgSuspendedUntil = organization.suspendedUntil
        ? typeof organization.suspendedUntil === 'string'
          ? (organization.suspendedUntil as string).split('T')[0]
          : new Date(organization.suspendedUntil).toISOString().split('T')[0]
        : ''
      if (formData.suspendedUntil !== orgSuspendedUntil) {
        updates.suspendedUntil = formData.suspendedUntil ? new Date(formData.suspendedUntil) : undefined
      }
      if (formData.defaultRegionId !== (organization.defaultRegionId || '')) {
        updates.defaultRegionId = formData.defaultRegionId || undefined
      }
      if (formData.telemetryEnabled !== organization.telemetryEnabled) {
        updates.telemetryEnabled = formData.telemetryEnabled
      }

      // Required-numeric fields (entity-level defaults, never null)
      const numericFields = [
        'maxCpuPerSandbox',
        'maxMemoryPerSandbox',
        'maxDiskPerSandbox',
        'maxSnapshotSize',
        'snapshotQuota',
        'volumeQuota',
        'snapshotDeactivationTimeoutMinutes',
      ] as const

      for (const field of numericFields) {
        const newValue = formData[field] === '' ? undefined : Number(formData[field])
        const oldValue = (organization as Record<string, any>)[field] ?? undefined
        if (newValue !== oldValue) {
          ;(updates as any)[field] = newValue
        }
      }

      // Nullable rate-limit fields: empty input = explicit null (clear override → use global default)
      const nullableFields = [
        'authenticatedRateLimit',
        'sandboxCreateRateLimit',
        'sandboxLifecycleRateLimit',
        'authenticatedRateLimitTtlSeconds',
        'sandboxCreateRateLimitTtlSeconds',
        'sandboxLifecycleRateLimitTtlSeconds',
      ] as const

      for (const field of nullableFields) {
        const newValue = formData[field] === '' ? null : Number(formData[field])
        const oldValue = (organization as Record<string, any>)[field] ?? null
        if (newValue !== oldValue) {
          ;(updates as any)[field] = newValue
        }
      }

      if (formData.sandboxLimitedNetworkEgress !== organization.sandboxLimitedNetworkEgress) {
        updates.sandboxLimitedNetworkEgress = formData.sandboxLimitedNetworkEgress
      }

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save')
        return
      }

      const patchDto: PatchOrganizationDto = { updates }
      if (Object.keys(preconditions).length > 0) {
        patchDto.preconditions = preconditions
      }

      const response = await BackofficeApiClient.updateOrganization(organization.id, patchDto)

      toast.success('Organization updated successfully')
      onSuccess()
      onClose()
      showApiWarnings(response)
    } catch (error) {
      handleUpdateError(error, 'Failed to update organization')
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
          <DialogTitle>Edit Organization: {organization?.name}</DialogTitle>
          <DialogDescription>Make changes to the organization configuration</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Organization Details</h3>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Acme Corporation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultRegionId">Default Region</Label>
              <Input
                id="defaultRegionId"
                value={formData.defaultRegionId || ''}
                onChange={(e) => setFormData({ ...formData, defaultRegionId: e.target.value })}
                placeholder="e.g., us, eu"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="suspended"
                checked={formData.suspended || false}
                onCheckedChange={(checked) => setFormData({ ...formData, suspended: checked })}
              />
              <Label htmlFor="suspended" className="cursor-pointer">
                Suspended
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="suspendedUntil">Suspended Until</Label>
              <Input
                id="suspendedUntil"
                type="date"
                value={formData.suspendedUntil || ''}
                onChange={(e) => setFormData({ ...formData, suspendedUntil: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Auto-suspend until this date</p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="telemetryEnabled"
                checked={formData.telemetryEnabled || false}
                onCheckedChange={(checked) => setFormData({ ...formData, telemetryEnabled: checked })}
              />
              <Label htmlFor="telemetryEnabled" className="cursor-pointer">
                Telemetry Enabled
              </Label>
            </div>
          </div>

          <Separator />

          {/* Per-Sandbox Limits */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Per-Sandbox Limits</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="maxCpuPerSandbox">Max CPU</Label>
                <Input
                  id="maxCpuPerSandbox"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.maxCpuPerSandbox}
                  onChange={(e) => setFormData({ ...formData, maxCpuPerSandbox: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxMemoryPerSandbox">Max Memory (GB)</Label>
                <Input
                  id="maxMemoryPerSandbox"
                  type="number"
                  min="0"
                  value={formData.maxMemoryPerSandbox}
                  onChange={(e) => setFormData({ ...formData, maxMemoryPerSandbox: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDiskPerSandbox">Max Disk (GB)</Label>
                <Input
                  id="maxDiskPerSandbox"
                  type="number"
                  min="0"
                  value={formData.maxDiskPerSandbox}
                  onChange={(e) => setFormData({ ...formData, maxDiskPerSandbox: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Storage Limits */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Storage Limits</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="maxSnapshotSize">Max Snapshot (GB)</Label>
                <Input
                  id="maxSnapshotSize"
                  type="number"
                  min="0"
                  value={formData.maxSnapshotSize}
                  onChange={(e) => setFormData({ ...formData, maxSnapshotSize: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snapshotQuota">Snapshot Quota (GB)</Label>
                <Input
                  id="snapshotQuota"
                  type="number"
                  min="0"
                  value={formData.snapshotQuota}
                  onChange={(e) => setFormData({ ...formData, snapshotQuota: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volumeQuota">Volume Quota (GB)</Label>
                <Input
                  id="volumeQuota"
                  type="number"
                  min="0"
                  value={formData.volumeQuota}
                  onChange={(e) => setFormData({ ...formData, volumeQuota: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Network */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Network</h3>
            <div className="flex items-center space-x-2">
              <Switch
                id="sandboxLimitedNetworkEgress"
                checked={formData.sandboxLimitedNetworkEgress || false}
                onCheckedChange={(checked) => setFormData({ ...formData, sandboxLimitedNetworkEgress: checked })}
              />
              <Label htmlFor="sandboxLimitedNetworkEgress" className="cursor-pointer">
                Limited Network Egress
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Restrict outbound network access for sandboxes in this organization
            </p>
          </div>

          <Separator />

          {/* Snapshot Lifecycle */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Snapshot Lifecycle</h3>
            <div className="space-y-2">
              <Label htmlFor="snapshotDeactivationTimeoutMinutes">Deactivation Timeout (minutes)</Label>
              <Input
                id="snapshotDeactivationTimeoutMinutes"
                type="number"
                min={1}
                value={formData.snapshotDeactivationTimeoutMinutes}
                onChange={(e) => setFormData({ ...formData, snapshotDeactivationTimeoutMinutes: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Default 20160 (14 days). Min 1.</p>
            </div>
          </div>

          <Separator />

          {/* Rate Limits */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Rate Limits</h3>
            <p className="text-xs text-muted-foreground">
              Leave empty to inherit the global default. Each limit pairs a request count with a TTL window (seconds).
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="authenticatedRateLimit">Authenticated requests</Label>
                <Input
                  id="authenticatedRateLimit"
                  type="number"
                  min={0}
                  placeholder="(global default)"
                  value={formData.authenticatedRateLimit}
                  onChange={(e) => setFormData({ ...formData, authenticatedRateLimit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="authenticatedRateLimitTtlSeconds">…per (seconds)</Label>
                <Input
                  id="authenticatedRateLimitTtlSeconds"
                  type="number"
                  min={1}
                  placeholder="(global default)"
                  value={formData.authenticatedRateLimitTtlSeconds}
                  onChange={(e) => setFormData({ ...formData, authenticatedRateLimitTtlSeconds: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sandboxCreateRateLimit">Sandbox create</Label>
                <Input
                  id="sandboxCreateRateLimit"
                  type="number"
                  min={0}
                  placeholder="(global default)"
                  value={formData.sandboxCreateRateLimit}
                  onChange={(e) => setFormData({ ...formData, sandboxCreateRateLimit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sandboxCreateRateLimitTtlSeconds">…per (seconds)</Label>
                <Input
                  id="sandboxCreateRateLimitTtlSeconds"
                  type="number"
                  min={1}
                  placeholder="(global default)"
                  value={formData.sandboxCreateRateLimitTtlSeconds}
                  onChange={(e) => setFormData({ ...formData, sandboxCreateRateLimitTtlSeconds: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sandboxLifecycleRateLimit">Sandbox lifecycle</Label>
                <Input
                  id="sandboxLifecycleRateLimit"
                  type="number"
                  min={0}
                  placeholder="(global default)"
                  value={formData.sandboxLifecycleRateLimit}
                  onChange={(e) => setFormData({ ...formData, sandboxLifecycleRateLimit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sandboxLifecycleRateLimitTtlSeconds">…per (seconds)</Label>
                <Input
                  id="sandboxLifecycleRateLimitTtlSeconds"
                  type="number"
                  min={1}
                  placeholder="(global default)"
                  value={formData.sandboxLifecycleRateLimitTtlSeconds}
                  onChange={(e) => setFormData({ ...formData, sandboxLifecycleRateLimitTtlSeconds: e.target.value })}
                />
              </div>
            </div>
          </div>

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
