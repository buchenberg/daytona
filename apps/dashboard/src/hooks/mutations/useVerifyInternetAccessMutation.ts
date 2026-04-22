/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

interface VerifyInternetAccessParams {
  organizationId: string
  radarSessionToken: string
}

export const useVerifyInternetAccessMutation = () => {
  const { billingApi } = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ organizationId, radarSessionToken }: VerifyInternetAccessParams) =>
      billingApi.verifyInternetAccess(organizationId, radarSessionToken),
    onSuccess: async (_data, { organizationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.organization.tier(organizationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.organization.detail(organizationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.organization.list() }),
      ])
    },
    // On error the backend may have persisted a failed evaluation (risk-assessment failure).
    // Awaiting the invalidation ensures the tier refetch completes before mutateAsync rejects,
    // so the UI flips to `evaluationFailed=true` in the same render as the loading state reset.
    onError: async (_error, { organizationId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organization.tier(organizationId) })
    },
  })
}
