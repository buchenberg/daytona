/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

export interface DeleteSecretMutationVariables {
  secretId: string
  organizationId: string
}

export const useDeleteSecretMutation = () => {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation<void, unknown, DeleteSecretMutationVariables>({
    mutationFn: async ({ secretId, organizationId }) => {
      await api.secretApi.deleteSecret(secretId, organizationId)
    },
    onSuccess: async (_data, { organizationId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(organizationId) })
    },
  })
}
