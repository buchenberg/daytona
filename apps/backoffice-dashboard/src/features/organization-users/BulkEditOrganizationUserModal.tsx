/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Info } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dashboard/ui/table'
import { Badge } from '@dashboard/ui/badge'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { OrganizationUser, OrganizationMemberRole } from '../../types'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface BulkEditOrganizationUserModalProps {
  organizationUsers: OrganizationUser[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface PreviewItem {
  id: string
  userName: string
  organizationName: string
  currentRole: string
  newRole: string
  valid: boolean
}

export const BulkEditOrganizationUserModal = ({
  organizationUsers,
  open,
  onClose,
  onSuccess,
}: BulkEditOrganizationUserModalProps) => {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [selectedRole, setSelectedRole] = useState<OrganizationMemberRole | ''>('')

  useEffect(() => {
    if (!open) {
      setPreview([])
      setSelectedRole('')
    }
  }, [open])

  useEffect(() => {
    if (selectedRole) {
      generatePreview()
    } else {
      setPreview([])
    }
  }, [selectedRole, organizationUsers])

  const generatePreview = () => {
    if (!selectedRole) {
      setPreview([])
      return
    }

    const previewItems: PreviewItem[] = organizationUsers.slice(0, 5).map((user) => ({
      id: `${user.organizationId}:${user.userId}`,
      userName: user.userId,
      organizationName: user.organizationId,
      currentRole: user.role,
      newRole: selectedRole,
      valid: true,
    }))

    setPreview(previewItems)
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)

      if (!selectedRole) {
        toast.error('Please select a role')
        return
      }

      const response = await BackofficeApiClient.bulkUpdateOrganizationUsers({
        ids: organizationUsers.map((u) => ({ organizationId: u.organizationId, userId: u.userId })),
        updates: { role: selectedRole },
      })

      const { successCount, failureCount, warnings } = response

      if (failureCount === 0) {
        toast.success(`Successfully updated ${successCount} organization users`)
      } else {
        toast.warning(`${successCount} organization users updated, ${failureCount} failed`)
      }

      warnings?.forEach((w: string) => toast.warning(w))

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Bulk update error:', error)
      toast.error('Failed to perform bulk update')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit User Roles ({organizationUsers.length} selected)</DialogTitle>
          <DialogDescription>Change the role for multiple organization users at once</DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Only the role field can be bulk-edited. Be careful when removing OWNER roles - organizations must have at
            least one owner.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select New Role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>New Role *</Label>
                <Select
                  value={selectedRole}
                  onValueChange={(value) => setSelectedRole(value as OrganizationMemberRole)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OrganizationMemberRole.OWNER}>
                      <div className="flex flex-col">
                        <span className="font-medium">Owner</span>
                        <span className="text-xs text-muted-foreground">Full access to everything</span>
                      </div>
                    </SelectItem>
                    <SelectItem value={OrganizationMemberRole.MEMBER}>
                      <div className="flex flex-col">
                        <span className="font-medium">Member</span>
                        <span className="text-xs text-muted-foreground">Standard user access</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {preview.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview (First {preview.length} users)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Current Role</TableHead>
                        <TableHead>New Role</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.userName}</TableCell>
                          <TableCell className="text-sm">{item.organizationName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.currentRole}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge>{item.newRole}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.valid ? 'default' : 'destructive'}>
                              {item.valid ? 'Valid' : 'Invalid'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {organizationUsers.length > 5 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    +{organizationUsers.length - 5} more users will be updated with the same role
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !selectedRole}>
            {loading ? 'Applying Changes...' : `Update ${organizationUsers.length} Users`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
