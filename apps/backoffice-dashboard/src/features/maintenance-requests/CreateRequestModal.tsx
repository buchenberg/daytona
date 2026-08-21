import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Textarea } from '@dashboard/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Slider } from '@dashboard/ui/slider'
import { MaintenanceType } from '@daytonaio/backoffice-api-client'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { handleUpdateError } from '../../lib/api'
import { useUser } from '../../providers/ApiProvider'
import { PriorityBadge } from './badges'
import { RunnerPicker } from './RunnerPicker'

interface CreateRequestModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  initialRunnerNames?: string[]
}

export const CreateRequestModal = ({ open, onClose, onSuccess, initialRunnerNames }: CreateRequestModalProps) => {
  const user = useUser()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<MaintenanceType>(MaintenanceType.DRAIN)
  const [runnerNames, setRunnerNames] = useState<string[]>([])
  const [requestedBy, setRequestedBy] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(2)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      // Prefilled example title the user can freely overwrite, e.g. "drain a1000, h1003"
      setTitle(`${MaintenanceType.DRAIN} ${(initialRunnerNames ?? []).join(', ')}`)
      setType(MaintenanceType.DRAIN)
      setRunnerNames(initialRunnerNames ?? [])
      setRequestedBy(user?.email ?? '')
      setDescription('')
      setPriority(2)
    }
  }, [open, user?.email])

  const handleSubmit = async () => {
    try {
      setSaving(true)
      await BackofficeApiClient.createMaintenanceRequest({
        title,
        type,
        runnerNames,
        requestedBy,
        description: description || undefined,
        priority,
      })
      toast.success('Maintenance request created')
      onSuccess()
      onClose()
    } catch (error) {
      handleUpdateError(error, 'Failed to create request')
    } finally {
      setSaving(false)
    }
  }

  const valid = title.trim().length > 0 && requestedBy.trim().length > 0 && runnerNames.length > 0

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New maintenance request</DialogTitle>
          <DialogDescription>Track a drain, reboot, reinstall or decommission across runners.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Drain h5001" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as MaintenanceType)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(MaintenanceType).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Runners</Label>
            <RunnerPicker selected={runnerNames} onChange={setRunnerNames} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requestedBy">Requested by</Label>
            <Input id="requestedBy" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Priority <PriorityBadge priority={priority} />
            </Label>
            <Slider min={0} max={3} step={1} value={priority} onValueChange={(value) => setPriority(value as number)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? 'Creating…' : 'Create request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
