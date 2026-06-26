/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { useDeleteSecretMutation } from '@/hooks/mutations/useDeleteSecretMutation'
import { handleApiError } from '@/lib/error-handling'
import { Secret } from '@daytona/api-client'
import React from 'react'
import { toast } from 'sonner'

interface DeleteSecretDialogProps {
  secret: Secret | null
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId?: string
}

export const DeleteSecretDialog: React.FC<DeleteSecretDialogProps> = ({
  secret,
  open,
  onOpenChange,
  organizationId,
}) => {
  const deleteSecretMutation = useDeleteSecretMutation()

  const handleDelete = async () => {
    if (!secret || !organizationId) return

    try {
      await deleteSecretMutation.mutateAsync({
        secretId: secret.id,
        organizationId,
      })
      toast.success('Secret deleted successfully')
      onOpenChange(false)
    } catch (error) {
      handleApiError(error, 'Failed to delete secret')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Secret</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{secret?.name}</strong>? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteSecretMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={deleteSecretMutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
          >
            {deleteSecretMutation.isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
