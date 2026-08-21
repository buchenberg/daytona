import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { handleUpdateError } from '../../lib/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Textarea } from '@dashboard/ui/textarea'
import { Separator } from '@dashboard/ui/separator'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { RegionQuota } from '../../types'
import { SandboxClass } from '../../types/quota-requests'
import { useQuotaUpdateBudget } from './useQuotaRequests'

interface UpdateQuotaRequestModalProps {
  regionQuota: RegionQuota | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const numberOrZero = (v: string): number => (v === '' ? 0 : Math.max(0, Math.floor(Number(v))))

type UpdateField = 'cpu' | 'memory' | 'disk' | 'gpu'

const UPDATE_FIELDS: { field: UpdateField; label: string; current: (rq: RegionQuota) => number }[] = [
  { field: 'cpu', label: '+ CPU (cores)', current: (rq) => rq.totalCpuQuota },
  { field: 'memory', label: '+ Memory (GB)', current: (rq) => rq.totalMemoryQuota },
  { field: 'disk', label: '+ Disk (GB)', current: (rq) => rq.totalDiskQuota },
  { field: 'gpu', label: '+ GPUs', current: (rq) => rq.totalGpuQuota },
]

const EMPTY_DELTAS: Record<UpdateField, string> = { cpu: '', memory: '', disk: '', gpu: '' }

export const UpdateQuotaRequestModal = ({ regionQuota, open, onClose, onSuccess }: UpdateQuotaRequestModalProps) => {
  const [loading, setLoading] = useState(false)
  const [deltaInputs, setDeltaInputs] = useState(EMPTY_DELTAS)
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()
  const { data: budget } = useQuotaUpdateBudget(open)

  const sandboxClass: SandboxClass = (regionQuota?.sandboxClass ?? 'container') as SandboxClass

  useEffect(() => {
    if (open) {
      setDeltaInputs(EMPTY_DELTAS)
      setReason('')
    }
  }, [open])

  const limits = budget?.limits

  // Mirror the server's per-update limit: percent% of the current value.
  const maxDelta = (current: number): number | null => (limits ? Math.floor((current * limits.maxPercent) / 100) : null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!regionQuota) return

    const deltas = {
      cpuDelta: numberOrZero(deltaInputs.cpu),
      memoryDelta: numberOrZero(deltaInputs.memory),
      diskDelta: numberOrZero(deltaInputs.disk),
      gpuDelta: numberOrZero(deltaInputs.gpu),
    }
    if (Object.values(deltas).every((delta) => delta <= 0)) {
      toast.info('Enter at least one increase')
      return
    }

    try {
      setLoading(true)
      await BackofficeApiClient.requestQuotaUpdate({
        organizationId: regionQuota.organizationId,
        regionId: regionQuota.regionId,
        sandboxClass,
        ...deltas,
        reason: reason || undefined,
      })
      toast.success('Update applied — pending approval, auto-reverts in 24h')
      await queryClient.invalidateQueries({ queryKey: ['quota-requests'] })
      onSuccess()
      onClose()
    } catch (error) {
      handleUpdateError(error, 'Failed to request quota update')
    } finally {
      setLoading(false)
    }
  }

  const remaining = budget?.remaining

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Request Quota Update</DialogTitle>
          <DialogDescription>
            {regionQuota?.organizationName || regionQuota?.organizationId} · {regionQuota?.regionId} · {sandboxClass}
            <br />
            Applies immediately and auto-reverts in 24h unless a full quota editor approves it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {UPDATE_FIELDS.map(({ field, label, current }) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`${field}Delta`}>{label}</Label>
                <Input
                  id={`${field}Delta`}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={deltaInputs[field]}
                  onChange={(e) => setDeltaInputs((prev) => ({ ...prev, [field]: e.target.value }))}
                />
                {regionQuota && (
                  <p className="text-xs text-muted-foreground">
                    now {current(regionQuota)}
                    {maxDelta(current(regionQuota)) !== null && `, max +${maxDelta(current(regionQuota))}`}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (shown to approvers)</Label>
            <Textarea
              id="reason"
              placeholder="e.g. customer ticket #1234 — burst before launch"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground">
            {limits && `Per-update limit: +${limits.maxPercent}% of the current value, bounded by your daily budget.`}
            {remaining && (
              <>
                {' '}
                Your remaining daily budget — cpu {remaining.cpu}, mem {remaining.memory}, disk {remaining.disk}, gpu{' '}
                {remaining.gpu}.
              </>
            )}
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Applying...' : 'Apply Update'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
