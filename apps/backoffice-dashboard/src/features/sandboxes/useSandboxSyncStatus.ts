/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { SandboxSyncStatusResponse } from '../../types'

interface UseSandboxSyncStatusOptions {
  sandboxId: string | null
  enabled?: boolean
  refetchInterval?: number | false
}

export const sandboxSyncStatusQueryKey = (sandboxId: string) => ['sandbox-sync-status', sandboxId] as const

export const useSandboxSyncStatus = ({
  sandboxId,
  enabled = true,
  refetchInterval = false,
}: UseSandboxSyncStatusOptions) => {
  return useQuery<SandboxSyncStatusResponse>({
    queryKey: sandboxId ? sandboxSyncStatusQueryKey(sandboxId) : ['sandbox-sync-status', 'idle'],
    queryFn: () => BackofficeApiClient.getSandboxSyncStatus(sandboxId!),
    enabled: enabled && Boolean(sandboxId),
    refetchInterval,
    staleTime: 0,
    gcTime: 0,
  })
}
