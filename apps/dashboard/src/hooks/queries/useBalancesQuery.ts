/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useInfiniteQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { useConfig } from '../useConfig'
import { queryKeys } from './queryKeys'

export const useBalancesQuery = ({
  organizationId,
  limit,
  enabled = true,
}: {
  organizationId: string
  limit?: number
  enabled?: boolean
}) => {
  const { billingApi } = useApi()
  const config = useConfig()

  return useInfiniteQuery({
    queryKey: queryKeys.billing.balances(organizationId, limit),
    queryFn: ({ pageParam }) => billingApi.listBalances(organizationId, { limit, nextPage: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextPage : undefined),
    enabled: Boolean(enabled && config.billingApiUrl && organizationId),
  })
}
