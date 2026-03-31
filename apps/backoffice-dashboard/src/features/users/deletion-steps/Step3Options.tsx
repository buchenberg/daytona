/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@dashboard/ui/button'
import { Checkbox } from '@dashboard/ui/checkbox'
import { Label } from '@dashboard/ui/label'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { AlertCircle } from 'lucide-react'
import type { UserDeletionOptionsDto } from '@daytonaio/backoffice-api-client'

interface Step3OptionsProps {
  options: UserDeletionOptionsDto
  onOptionsChange: (options: UserDeletionOptionsDto) => void
  onExecute: () => void
  onBack: () => void
}

export const Step3Options = ({ options, onOptionsChange, onExecute, onBack }: Step3OptionsProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Step 3: Deletion Options</h2>
        <p className="text-muted-foreground mt-2">
          Select which additional destructive actions to perform. These are optional and default to OFF for safety.
        </p>
      </div>

      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Warning:</strong> Destructive actions cannot be undone. Proceed with caution.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-6 space-y-6">
        <h3 className="font-semibold mb-4">Automatic Actions (Always Performed)</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border-2 border-primary bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs">✓</span>
            </div>
            <span>Destroy all sandboxes (set desiredState to 'destroyed')</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border-2 border-primary bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs">✓</span>
            </div>
            <span>Deactivate all snapshots (set state to 'inactive')</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border-2 border-primary bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs">✓</span>
            </div>
            <span>Anonymize organizations (set name to 'DELETED')</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border-2 border-primary bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs">✓</span>
            </div>
            <span>Anonymize user (set email to 'DELETED', prepend 'DELETED_' to ID)</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6 space-y-6">
        <h3 className="font-semibold mb-4">Optional Destructive Actions</h3>

        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="deleteSandboxTemplates"
              checked={options.deleteSandboxTemplates || false}
              onCheckedChange={(checked) => onOptionsChange({ ...options, deleteSandboxTemplates: checked as boolean })}
            />
            <div className="space-y-1">
              <Label htmlFor="deleteSandboxTemplates" className="text-sm font-medium cursor-pointer">
                Delete Sandbox Templates
              </Label>
              <p className="text-sm text-muted-foreground">
                Permanently delete all sandbox templates in owned organizations. This is a hard delete.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="deleteApiKeys"
              checked={options.deleteApiKeys || false}
              onCheckedChange={(checked) => onOptionsChange({ ...options, deleteApiKeys: checked as boolean })}
            />
            <div className="space-y-1">
              <Label htmlFor="deleteApiKeys" className="text-sm font-medium cursor-pointer">
                Delete API Keys
              </Label>
              <p className="text-sm text-muted-foreground">
                Permanently delete all API keys in owned organizations. This is a hard delete.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="deleteOrgMemberships"
              checked={options.deleteOrgMemberships || false}
              onCheckedChange={(checked) => onOptionsChange({ ...options, deleteOrgMemberships: checked as boolean })}
            />
            <div className="space-y-1">
              <Label htmlFor="deleteOrgMemberships" className="text-sm font-medium cursor-pointer">
                Delete Organization Memberships
              </Label>
              <p className="text-sm text-muted-foreground">
                Permanently delete all organization user records for this user. This is a hard delete.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button variant="destructive" onClick={onExecute}>
          Execute Deletion
        </Button>
      </div>
    </div>
  )
}
