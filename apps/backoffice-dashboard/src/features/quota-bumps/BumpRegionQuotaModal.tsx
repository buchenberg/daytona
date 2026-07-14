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
import { SandboxClass } from '../../types/quota-bumps'
import { useQuotaBumpBudget } from './useQuotaBumps'

interface BumpRegionQuotaModalProps {
  regionQuota: RegionQuota | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const numberOrZero = (v: string): number => (v === '' ? 0 : Math.max(0, Math.floor(Number(v))))

type BumpField = 'cpu' | 'memory' | 'disk'

const BUMP_FIELDS: { field: BumpField; label: string; current: (rq: RegionQuota) => number }[] = [
  { field: 'cpu', label: '+ CPU (cores)', current: (rq) => rq.totalCpuQuota },
  { field: 'memory', label: '+ Memory (GB)', current: (rq) => rq.totalMemoryQuota },
  { field: 'disk', label: '+ Disk (GB)', current: (rq) => rq.totalDiskQuota },
]

const EMPTY_DELTAS: Record<BumpField, string> = { cpu: '', memory: '', disk: '' }

export const BumpRegionQuotaModal = ({ regionQuota, open, onClose, onSuccess }: BumpRegionQuotaModalProps) => {
  const [loading, setLoading] = useState(false)
  const [deltaInputs, setDeltaInputs] = useState(EMPTY_DELTAS)
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()
  const { data: budget } = useQuotaBumpBudget(open)

  const sandboxClass: SandboxClass = (regionQuota?.sandboxClass ?? 'container') as SandboxClass

  useEffect(() => {
    if (open) {
      setDeltaInputs(EMPTY_DELTAS)
      setReason('')
    }
  }, [open])

  const limits = budget?.limits

  // Mirror the server's per-bump limit: max( percent% of current, flat allowance ).
  const maxDelta = (field: BumpField, current: number): number | null => {
    if (!limits) return null
    return Math.max(Math.floor((current * limits.maxPercent) / 100), limits.flatIncrease[field])
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!regionQuota) return

    const deltas = {
      cpuDelta: numberOrZero(deltaInputs.cpu),
      memoryDelta: numberOrZero(deltaInputs.memory),
      diskDelta: numberOrZero(deltaInputs.disk),
    }
    if (deltas.cpuDelta <= 0 && deltas.memoryDelta <= 0 && deltas.diskDelta <= 0) {
      toast.info('Enter at least one increase')
      return
    }

    try {
      setLoading(true)
      await BackofficeApiClient.createQuotaBump({
        organizationId: regionQuota.organizationId,
        regionId: regionQuota.regionId,
        sandboxClass,
        ...deltas,
        reason: reason || undefined,
      })
      toast.success('Temporary bump applied — pending approval, auto-reverts in 24h')
      await queryClient.invalidateQueries({ queryKey: ['quota-bumps'] })
      onSuccess()
      onClose()
    } catch (error) {
      handleUpdateError(error, 'Failed to create quota bump')
    } finally {
      setLoading(false)
    }
  }

  const remaining = budget?.remaining

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Temporary Quota Bump</DialogTitle>
          <DialogDescription>
            {regionQuota?.organizationName || regionQuota?.organizationId} · {regionQuota?.regionId} · {sandboxClass}
            <br />
            Applies immediately and auto-reverts in 24h unless a full quota editor approves it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {BUMP_FIELDS.map(({ field, label, current }) => (
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
                    {maxDelta(field, current(regionQuota)) !== null &&
                      `, max +${maxDelta(field, current(regionQuota))}`}
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
            {limits &&
              `Per-bump limit: the greater of +${limits.maxPercent}% of the current value or +${limits.flatIncrease.cpu}/${limits.flatIncrease.memory}/${limits.flatIncrease.disk} (cpu/mem/disk), bounded by your daily budget.`}
            {remaining && (
              <>
                {' '}
                Your remaining daily budget — cpu {remaining.cpu}, mem {remaining.memory}, disk {remaining.disk}.
              </>
            )}
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Applying...' : 'Apply Bump'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
