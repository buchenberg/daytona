/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { toast } from 'sonner'

export function handleUpdateError(error: unknown, fallbackMessage: string): void {
  const status = (error as any)?.status ?? (error as any)?.response?.status
  if (status === 403) {
    toast.error('You do not have permission to perform this action')
  } else if (status === 409) {
    const message = (error as any)?.response?.data?.message || 'Entity was modified by another user'
    toast.error(`Conflict: ${message}. Please refresh and try again.`)
  } else {
    console.error(fallbackMessage, error)
    toast.error(fallbackMessage)
  }
}

export function showApiWarnings(response: unknown): void {
  const warnings = (response as { warnings?: string[] })?.warnings
  if (warnings && warnings.length > 0) {
    warnings.forEach((w) => toast.warning(w))
  }
}
