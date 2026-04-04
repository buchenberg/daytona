/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { FC } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface CompactDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export const CompactDialog: FC<CompactDialogProps> = ({ open, onClose, onConfirm }) => {
  if (!open) return null

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border rounded-xl shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-sm">Compact Conversation</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            This will summarize the entire conversation into a detailed handoff context. Previous messages will be{' '}
            <span className="font-medium text-foreground">permanently replaced</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Mali will retain a structured summary covering key findings, tools used, data discovered, and open questions
            — so it can continue working effectively.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <button
            onClick={onClose}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700"
          >
            Compact
          </button>
        </div>
      </div>
    </div>
  )
}
