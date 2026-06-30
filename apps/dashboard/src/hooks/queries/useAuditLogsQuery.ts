/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PaginatedAuditLogs } from '@daytona/api-client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { useSelectedOrganization } from '../useSelectedOrganization'
import { queryKeys } from './queryKeys'

export interface AuditLogsQueryParams {
  page: number
  pageSize: number
  cursor?: string
  // Keyed as `field[operator]` (e.g. `action[in]`); passed via options.params
  // because the generated client mis-serializes nested filter objects.
  filterParams?: Record<string, string>
}

export function useAuditLogsQuery(
  params: AuditLogsQueryParams,
  options?: {
    enabled?: boolean
    refetchInterval?: number | false
  },
) {
  const { auditApi } = useApi()
  const { selectedOrganization } = useSelectedOrganization()

  return useQuery<PaginatedAuditLogs>({
    queryKey: queryKeys.audit.logs(selectedOrganization?.id ?? '', params),
    queryFn: async () => {
      if (!selectedOrganization) {
        throw new Error('No organization selected')
      }

      const response = await auditApi.getOrganizationAuditLogs(
        selectedOrganization.id,
        params.page,
        params.pageSize,
        undefined, // from
        undefined, // to
        params.cursor,
        undefined, // id
        undefined, // actorId
        undefined, // actorEmail
        undefined, // actorApiKeyPrefix
        undefined, // actorApiKeySuffix
        undefined, // action
        undefined, // targetType
        undefined, // targetId
        undefined, // statusCode
        undefined, // createdAt
        params.filterParams ? { params: params.filterParams } : undefined,
      )

      return response.data
    },
    enabled: Boolean(selectedOrganization && options?.enabled !== false),
    placeholderData: keepPreviousData,
    refetchInterval: options?.refetchInterval,
  })
}
