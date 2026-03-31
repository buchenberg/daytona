/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState } from 'react'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { AlertCircle } from 'lucide-react'

interface Step1Auth0ConfirmationProps {
  userId: string
  onUserIdChange: (userId: string) => void
  onNext: () => void
  onCancel: () => void
}

export const Step1Auth0Confirmation = ({ userId, onUserIdChange, onNext, onCancel }: Step1Auth0ConfirmationProps) => {
  const [error, setError] = useState('')

  const handleNext = () => {
    if (!userId.trim()) {
      setError('User ID is required')
      return
    }
    setError('')
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Step 1: Auth0 User Confirmation</h2>
        <p className="text-muted-foreground mt-2">
          Before proceeding with user deletion from the database, ensure the user has been deleted from Auth0.
        </p>
      </div>

      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Important:</strong> Delete the user from Auth0 &gt; User Management &gt; Users FIRST, then copy their
          User ID and paste it below.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div>
          <Label htmlFor="userId">Auth0 User ID</Label>
          <Input
            id="userId"
            placeholder="e.g., google-oauth2|105425697538376997457"
            value={userId}
            onChange={(e) => {
              onUserIdChange(e.target.value)
              setError('')
            }}
            className={error ? 'border-destructive' : ''}
          />
          {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          <p className="text-sm text-muted-foreground mt-1">The full User ID from Auth0 (includes provider prefix)</p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleNext}>Fetch User & Preview</Button>
      </div>
    </div>
  )
}
