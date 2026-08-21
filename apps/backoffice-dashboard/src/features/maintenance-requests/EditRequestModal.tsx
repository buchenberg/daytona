import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Textarea } from '@dashboard/ui/textarea'
import { Slider } from '@dashboard/ui/slider'
import { MaintenanceRequestDto, UpdateMaintenanceRequestDto } from '@daytonaio/backoffice-api-client'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { handleUpdateError } from '../../lib/api'
import { PriorityBadge } from './badges'

interface EditRequestModalProps {
  request: MaintenanceRequestDto
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const EditRequestModal = ({ request, open, onClose, onSuccess }: EditRequestModalProps) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(2)
  const [saving, setSaving] = useState(false)
  const [original, setOriginal] = useState(request)

  // Seed only when the dialog opens — the detail query polls in the background
  // and a fresh `request` identity must not clobber in-progress edits. The
  // snapshot is what handleSubmit diffs against, so a poll while the dialog is
  // open cannot silently widen the patch to fields the user never touched.
  useEffect(() => {
    if (open) {
      setOriginal(request)
      setTitle(request.title)
      setDescription(request.description)
      setPriority(request.priority)
    }
  }, [open, request.id])

  const handleSubmit = async () => {
    const updates: UpdateMaintenanceRequestDto = {}
    if (title !== original.title) updates.title = title
    if (description !== original.description) updates.description = description
    if (priority !== original.priority) updates.priority = priority

    if (Object.keys(updates).length === 0) {
      toast.info('No changes to save')
      return
    }

    try {
      setSaving(true)
      await BackofficeApiClient.updateMaintenanceRequest(request.id, updates)
      toast.success('Request updated')
      onSuccess()
      onClose()
    } catch (error) {
      handleUpdateError(error, 'Failed to update request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Priority <PriorityBadge priority={priority} />
            </Label>
            <Slider min={0} max={3} step={1} value={priority} onValueChange={(value) => setPriority(value as number)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || title.trim().length === 0}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
