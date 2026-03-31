/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@dashboard/ui/button'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { Badge } from '@dashboard/ui/badge'
import { AlertCircle, Building2, Database, Camera, Key, FileBox } from 'lucide-react'
import type { UserDeletionPreviewDto } from '@daytonaio/backoffice-api-client'

interface Step2PreviewResourcesProps {
  preview: UserDeletionPreviewDto
  loading?: boolean
  onNext: () => void
  onBack: () => void
}

export const Step2PreviewResources = ({ preview, loading, onNext, onBack }: Step2PreviewResourcesProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading preview...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Step 2: Preview Resources</h2>
        <p className="text-muted-foreground mt-2">Review the resources that will be affected by this deletion.</p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>User:</strong> {preview.name} ({preview.email})
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Organizations (will be anonymized)
        </h3>
        {preview.organizations.length > 0 ? (
          <div className="space-y-2">
            {preview.organizations.map((org) => (
              <div key={org.id} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm">{org.name}</span>
                <Badge variant="outline">{org.role}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No organizations owned by this user</p>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Database className="h-5 w-5" />
          Sandboxes (will be destroyed)
        </h3>
        {preview.sandboxes.length > 0 ? (
          <div className="space-y-2">
            {preview.sandboxes.slice(0, 5).map((sandbox) => (
              <div key={sandbox.id} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm">{sandbox.name}</span>
                <Badge variant="secondary">{sandbox.state}</Badge>
              </div>
            ))}
            {preview.sandboxes.length > 5 && (
              <p className="text-sm text-muted-foreground">...and {preview.sandboxes.length - 5} more</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No sandboxes in owned organizations</p>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Snapshots (will be deactivated)
        </h3>
        {preview.snapshots.length > 0 ? (
          <div className="space-y-2">
            {preview.snapshots.slice(0, 5).map((snapshot) => (
              <div key={snapshot.id} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm">{snapshot.name}</span>
                <Badge variant="secondary">{snapshot.state}</Badge>
              </div>
            ))}
            {preview.snapshots.length > 5 && (
              <p className="text-sm text-muted-foreground">...and {preview.snapshots.length - 5} more</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No snapshots in owned organizations</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">API Keys</span>
          </div>
          <p className="text-2xl font-bold">{preview.apiKeys}</p>
          <p className="text-xs text-muted-foreground">Can be optionally deleted</p>
        </div>

        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileBox className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Sandbox Templates</span>
          </div>
          <p className="text-2xl font-bold">{preview.sandboxTemplates}</p>
          <p className="text-xs text-muted-foreground">Can be optionally deleted</p>
        </div>
      </div>

      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Impact:</strong> {preview.estimatedImpact}
        </AlertDescription>
      </Alert>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Next</Button>
      </div>
    </div>
  )
}
