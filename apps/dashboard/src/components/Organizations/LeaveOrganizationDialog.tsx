/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface LeaveOrganizationDialogProps {
  onLeaveOrganization: () => Promise<boolean>
  loading: boolean
}

export const LeaveOrganizationDialog: React.FC<LeaveOrganizationDialogProps> = ({ onLeaveOrganization, loading }) => {
  const [open, setOpen] = useState(false)

  const handleLeaveOrganization = async () => {
    const success = await onLeaveOrganization()
    if (success) {
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" className="w-auto px-4">
            Leave Organization
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave Organization</DialogTitle>
          <DialogDescription>Are you sure you want to leave this organization?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="secondary" disabled={loading}>
                Cancel
              </Button>
            }
          />
          {loading ? (
            <Button type="button" variant="default" disabled>
              Leaving...
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={handleLeaveOrganization}>
              Leave
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
