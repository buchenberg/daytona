/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Edit, X, Info } from 'lucide-react'
import { Button } from '@dashboard/ui/button'

interface BulkActionToolbarProps {
  selectedCount: number
  onBulkEdit: () => void
  onClearSelection: () => void
}

export const BulkActionToolbar = ({ selectedCount, onBulkEdit, onClearSelection }: BulkActionToolbarProps) => {
  if (selectedCount === 0) {
    return null
  }

  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
      <div className="flex items-center gap-4">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <div className="flex items-center gap-2">
          <span className="font-semibold text-blue-900 dark:text-blue-100">{selectedCount}</span>
          <span className="text-blue-900 dark:text-blue-100">{selectedCount === 1 ? 'item' : 'items'} selected</span>
          <Button
            variant="link"
            size="sm"
            onClick={onClearSelection}
            className="h-auto p-0 text-blue-600 dark:text-blue-400"
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>

      <Button onClick={onBulkEdit}>
        <Edit className="mr-2 h-4 w-4" />
        Bulk Edit
      </Button>
    </div>
  )
}
