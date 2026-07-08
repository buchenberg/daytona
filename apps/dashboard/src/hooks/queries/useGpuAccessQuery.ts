/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { GpuAccess } from '@daytona/billing-api-client'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { useConfig } from '../useConfig'
import { queryKeys } from './queryKeys'

export const useGpuAccessQuery = ({
  organizationId,
  enabled = true,
  ...queryOptions
}: {
  organizationId: string
  enabled?: boolean
} & Omit<UseQueryOptions<GpuAccess>, 'queryKey' | 'queryFn'>) => {
  const { billingApi } = useApi()
  const config = useConfig()

  return useQuery<GpuAccess>({
    queryKey: queryKeys.billing.gpuAccess(organizationId),
    queryFn: () => billingApi.validateGpuAccess(organizationId),
    enabled: Boolean(enabled && config.billingApiUrl && organizationId),
    // The API caches GPU access for 1 minute; keep the dashboard in step.
    staleTime: 60_000,
    ...queryOptions,
  })
}
