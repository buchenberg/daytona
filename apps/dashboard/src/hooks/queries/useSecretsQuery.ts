/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Secret } from '@daytona/api-client'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { queryKeys } from './queryKeys'

export const useSecretsQuery = (organizationId?: string) => {
  const api = useApi()

  return useQuery<Secret[]>({
    queryKey: organizationId ? queryKeys.secrets.list(organizationId) : queryKeys.secrets.all,
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return []
      }
      const response = await api.secretApi.listSecrets(organizationId)
      return response.data
    },
  })
}
