/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@dashboard/ui/alert'

export function CautionBanner() {
  return (
    <div className="border-b bg-destructive/5 px-6 py-4">
      <Alert variant="destructive" className="border-0 bg-transparent p-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="font-medium leading-none whitespace-nowrap flex items-center">
          <span className="font-bold">You are using internal admin tools</span>&nbsp;- proceed with caution as actions
          can affect production data
        </AlertDescription>
      </Alert>
    </div>
  )
}
