/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@dashboard/ui/button'
import { Badge } from '@dashboard/ui/badge'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { CheckCircle, Copy, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { UserDeletionResponseDto } from '@daytonaio/backoffice-api-client'

interface Step4ExecuteAndManualProps {
  result: UserDeletionResponseDto | null
  loading?: boolean
  error?: string
  onClose: () => void
}

export const Step4ExecuteAndManual = ({ result, loading, error, onClose }: Step4ExecuteAndManualProps) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Executing deletion...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Step 4: Deletion Failed</h2>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Error:</strong> {error}
          </AlertDescription>
        </Alert>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    )
  }

  if (!result) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Step 4: Deletion Complete</h2>
        <p className="text-muted-foreground mt-2">
          Database operations completed. Manual steps required for external services.
        </p>
      </div>

      <Alert>
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription>
          <strong>Success:</strong> Database deletion operations completed successfully.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-6 space-y-4">
        <h3 className="font-semibold mb-4">Executed Actions</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Sandboxes Destroyed</span>
            <span className="text-2xl font-bold">{result.executedActions.sandboxesDestroyed}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Snapshots Deactivated</span>
            <span className="text-2xl font-bold">{result.executedActions.snapshotsDeactivated}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Organizations Anonymized</span>
            <span className="text-2xl font-bold">{result.executedActions.organizationsAnonymized}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">User Anonymized</span>
            <Badge variant={result.executedActions.userAnonymized ? 'default' : 'secondary'}>
              {result.executedActions.userAnonymized ? 'Yes' : 'No'}
            </Badge>
          </div>
        </div>

        {result.executedActions.sandboxTemplatesDeleted !== undefined && (
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-sm">Sandbox Templates Deleted</span>
            <Badge>{result.executedActions.sandboxTemplatesDeleted}</Badge>
          </div>
        )}
        {result.executedActions.apiKeysDeleted !== undefined && (
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-sm">API Keys Deleted</span>
            <Badge>{result.executedActions.apiKeysDeleted}</Badge>
          </div>
        )}
        {result.executedActions.membershipsDeleted !== undefined && (
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-sm">Memberships Deleted</span>
            <Badge>{result.executedActions.membershipsDeleted}</Badge>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        <h3 className="font-semibold mb-4">Manual Steps Required</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Complete the following manual steps in external services to finalize the user deletion:
        </p>

        <div className="space-y-3">
          {result.manualSteps.map((step, index) => (
            <div key={index} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{step.service}</h4>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(step.identifier)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy ID
                </Button>
              </div>
              <p className="text-sm">{step.instruction}</p>
              <div className="bg-muted p-2 rounded font-mono text-xs">{step.identifier}</div>
            </div>
          ))}
        </div>
      </div>

      {result.warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Warnings:</strong>
            <ul className="list-disc list-inside mt-2">
              {result.warnings.map((warning, index) => (
                <li key={index} className="text-sm">
                  {warning}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end pt-4">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}
