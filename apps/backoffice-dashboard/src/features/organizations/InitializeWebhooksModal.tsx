/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@dashboard/ui/alert-dialog'
import { Button } from '@dashboard/ui/button'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { AlertCircle, CheckCircle } from 'lucide-react'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { Organization } from '../../types'
import { toast } from 'sonner'

interface InitializeWebhooksModalProps {
  organization: Organization | null
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const InitializeWebhooksModal = ({ organization, open, onClose, onSuccess }: InitializeWebhooksModalProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleInitialize = async () => {
    if (!organization) return

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const response = await BackofficeApiClient.initializeWebhooks(organization.id)

      if (response.success) {
        setSuccess(true)
        toast.success('Webhooks initialized successfully')
        if (onSuccess) {
          onSuccess()
        }
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError(response.error || 'Failed to initialize webhooks')
        toast.error(response.error || 'Failed to initialize webhooks')
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to initialize webhooks'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (!organization) return null

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Initialize Webhooks</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to enable webhooks for organization <strong>{organization.name}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>Webhooks initialized successfully!</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleInitialize} disabled={loading || success}>
            {loading ? 'Initializing...' : success ? 'Done' : 'Initialize Webhooks'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
