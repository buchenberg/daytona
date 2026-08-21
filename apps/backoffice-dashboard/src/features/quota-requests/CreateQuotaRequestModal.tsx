import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { handleUpdateError } from '../../lib/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Textarea } from '@dashboard/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { CREATE_SANDBOX_CLASSES, SandboxClass } from '../../types/quota-requests'
import { useQuotaCreateDefaults, useQuotaRegions } from './useQuotaRequests'

interface CreateQuotaRequestModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const CreateQuotaRequestModal = ({ open, onClose, onSuccess }: CreateQuotaRequestModalProps) => {
  const [loading, setLoading] = useState(false)
  const [organizationId, setOrganizationId] = useState('')
  const [regionId, setRegionId] = useState('')
  const [sandboxClass, setSandboxClass] = useState<SandboxClass>('container')
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()

  const { data: defaults } = useQuotaCreateDefaults(open)
  const { data: regions } = useQuotaRegions(open)

  useEffect(() => {
    if (open) {
      setOrganizationId('')
      setRegionId('')
      setSandboxClass('container')
      setReason('')
    }
  }, [open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!organizationId.trim() || !regionId) {
      toast.info('Organization ID and region are required')
      return
    }

    try {
      setLoading(true)
      await BackofficeApiClient.requestQuotaCreate({
        organizationId: organizationId.trim(),
        regionId,
        sandboxClass,
        reason: reason || undefined,
      })
      toast.success('Quota created — pending approval, auto-removes in 24h')
      await queryClient.invalidateQueries({ queryKey: ['quota-requests'] })
      onSuccess()
      onClose()
    } catch (error) {
      handleUpdateError(error, 'Failed to create quota')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create Region Quota</DialogTitle>
          <DialogDescription>
            Creates the quota with the default limits immediately. Auto-removes in 24h unless a full quota editor
            approves it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="organizationId">Organization ID</Label>
            <Input
              id="organizationId"
              placeholder="UUID"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="regionId">Region</Label>
              <Select value={regionId} onValueChange={setRegionId}>
                <SelectTrigger id="regionId">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {(regions ?? []).map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name} ({region.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sandboxClass">Sandbox Class</Label>
              <Select value={sandboxClass} onValueChange={(value) => setSandboxClass(value as SandboxClass)}>
                <SelectTrigger id="sandboxClass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_SANDBOX_CLASSES.map((sc) => (
                    <SelectItem key={sc} value={sc}>
                      {sc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (shown to approvers)</Label>
            <Textarea
              id="reason"
              placeholder="e.g. customer ticket #1234 — new region rollout"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {defaults && (
            <p className="text-xs text-muted-foreground">
              The quota is created with {defaults.cpu} CPU, {defaults.memory} GiB memory, {defaults.disk} GiB disk and{' '}
              {defaults.gpu} GPUs.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Quota'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
