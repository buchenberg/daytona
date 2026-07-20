import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UpdateWarmPool, WarmPool } from '@daytona/api-client'
import React, { useEffect, useState } from 'react'

interface EditWarmPoolDialogProps {
  warmPool: WarmPool
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateWarmPool: (warmPoolId: string, data: UpdateWarmPool) => Promise<boolean>
  loading: boolean
}

export const EditWarmPoolDialog: React.FC<EditWarmPoolDialogProps> = ({
  warmPool,
  open,
  onOpenChange,
  onUpdateWarmPool,
  loading,
}) => {
  const [pool, setPool] = useState(warmPool.pool)

  // Reset form when dialog opens with a new warm pool
  useEffect(() => {
    if (open) {
      setPool(warmPool.pool)
    }
  }, [open, warmPool])

  const hasChanges = pool !== warmPool.pool

  const handleUpdate = async () => {
    const success = await onUpdateWarmPool(warmPool.id, { pool })
    if (success) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Warm Pool: {warmPool.snapshot}</DialogTitle>
          <DialogDescription>Change how many sandboxes are kept ready. Set 0 to drain the pool.</DialogDescription>
        </DialogHeader>

        <form
          id="edit-warm-pool-form"
          className="space-y-3 px-1 pb-1"
          onSubmit={async (e) => {
            e.preventDefault()
            await handleUpdate()
          }}
        >
          <Label htmlFor="warm-pool-size">Pool size</Label>
          <Input
            id="warm-pool-size"
            type="number"
            min={0}
            value={pool}
            onChange={(e) => setPool(Number.isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
          />
          <p className="text-sm text-muted-foreground mt-1 pl-1">
            Number of sandboxes to keep ready. Capped by your organization quota.
          </p>
        </form>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            }
          />
          {loading ? (
            <Button type="button" variant="default" disabled>
              Saving...
            </Button>
          ) : (
            <Button
              type="submit"
              form="edit-warm-pool-form"
              variant="default"
              disabled={loading || !hasChanges || pool < 0}
            >
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
