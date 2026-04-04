/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { FallbackProps } from 'react-error-boundary'

export function ChatErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-destructive">Something went wrong</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {error?.message || 'An unexpected error occurred in the chat interface.'}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={resetErrorBoundary}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  )
}
