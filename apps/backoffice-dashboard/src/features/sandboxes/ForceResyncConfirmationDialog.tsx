/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useEffect, useState } from 'react'
import { Button } from '@dashboard/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'

interface ForceResyncConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  sandboxId: string
  loading: boolean
  onConfirm: () => void
}

export const ForceResyncConfirmationDialog = ({
  open,
  onOpenChange,
  organizationId,
  sandboxId,
  loading,
  onConfirm,
}: ForceResyncConfirmationDialogProps) => {
  const [typedOrgId, setTypedOrgId] = useState('')

  useEffect(() => {
    if (!open) {
      setTypedOrgId('')
    }
  }, [open])

  const matches = typedOrgId.trim() === organizationId

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Force resync for organization</DialogTitle>
          <DialogDescription>
            This will trigger a Debezium incremental snapshot for <strong>every sandbox</strong> in this organization,
            refreshing OpenSearch from the source-of-truth database. Other sandboxes in this organization may briefly
            appear out of sync to their owners while the resync propagates.
            <br />
            <br />
            Be certain before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/50 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Triggered for sandbox:</span>{' '}
              <span className="font-mono text-xs">{sandboxId}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Affected organization:</span>{' '}
              <span className="font-mono text-xs">{organizationId}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-org-id">To confirm, type the organization ID:</Label>
            <Input
              id="confirm-org-id"
              value={typedOrgId}
              onChange={(e) => setTypedOrgId(e.target.value)}
              placeholder={organizationId}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!matches || loading} onClick={onConfirm}>
            {loading ? 'Triggering resync...' : 'Force resync'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
