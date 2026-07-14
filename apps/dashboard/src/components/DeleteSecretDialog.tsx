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
import { Spinner } from '@/components/ui/spinner'
import { useDeleteSecretMutation } from '@/hooks/mutations/useDeleteSecretMutation'
import { handleApiError } from '@/lib/error-handling'
import { preventBaseUIHandler } from '@/lib/utils'
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
            The secret{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground break-all">
              {secret?.name}
            </code>{' '}
            will be permanently deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteSecretMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={deleteSecretMutation.isPending}
            onClick={(e) => {
              preventBaseUIHandler(e)
              handleDelete()
            }}
          >
            {deleteSecretMutation.isPending && <Spinner />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
