/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useEffect, useState, FormEvent } from 'react'
import { toast } from 'sonner'
import { handleUpdateError, showApiWarnings } from '../../lib/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import {
  OrganizationUser,
  UpdateOrganizationUserDto,
  PatchOrganizationUserDto,
  OrganizationMemberRole,
} from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface EditOrganizationUserModalProps {
  organizationUser: OrganizationUser | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// No manual form interface - use generated UpdateOrganizationUserDto directly
const roleDescriptions: Record<string, string> = {
  [OrganizationMemberRole.OWNER]: 'Full access - Can manage all organization settings, users, and resources',
  [OrganizationMemberRole.MEMBER]: 'Standard access - Can use resources but cannot manage settings',
}

export const EditOrganizationUserModal = ({
  organizationUser,
  open,
  onClose,
  onSuccess,
}: EditOrganizationUserModalProps) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<UpdateOrganizationUserDto>({})

  useEffect(() => {
    if (organizationUser && open) {
      setFormData({
        role: organizationUser.role as any,
      })
    }
  }, [organizationUser, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!organizationUser) return

    try {
      setLoading(true)

      // Only send changed fields, with preconditions for optimistic concurrency
      const updates: UpdateOrganizationUserDto = {}
      const preconditions: UpdateOrganizationUserDto = {}

      if (formData.role !== organizationUser.role) {
        updates.role = formData.role as any
        preconditions.role = organizationUser.role as any
      }

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save')
        return
      }

      const patchDto: PatchOrganizationUserDto = { updates }
      if (Object.keys(preconditions).length > 0) {
        patchDto.preconditions = preconditions
      }

      const response = await BackofficeApiClient.updateOrganizationUser(
        organizationUser.organizationId,
        organizationUser.userId,
        patchDto,
      )

      toast.success('Organization user updated successfully')
      onSuccess()
      onClose()
      showApiWarnings(response)
    } catch (error) {
      handleUpdateError(error, 'Failed to update organization user')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit User Role</DialogTitle>
          <DialogDescription>
            Change the role for user {organizationUser?.userId} in organization {organizationUser?.organizationId}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select
              value={formData.role || ''}
              onValueChange={(value) => setFormData({ ...formData, role: value as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent align="start" className="w-[--radix-select-trigger-width]">
                <SelectItem value={OrganizationMemberRole.OWNER}>Owner</SelectItem>
                <SelectItem value={OrganizationMemberRole.MEMBER}>Member</SelectItem>
              </SelectContent>
            </Select>
            {formData.role && (
              <p className="text-xs text-muted-foreground">{roleDescriptions[formData.role as unknown as string]}</p>
            )}
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
