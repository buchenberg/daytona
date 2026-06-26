/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Secret } from '@daytona/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

export interface CreateSecretMutationVariables {
  name: string
  value: string
  description?: string
  hosts?: string[]
  organizationId: string
}

export const useCreateSecretMutation = () => {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation<Secret, unknown, CreateSecretMutationVariables>({
    mutationFn: async ({ organizationId, name, value, description, hosts }) => {
      const response = await api.secretApi.createSecret({ name, value, description, hosts }, organizationId)
      return response.data
    },
    onSuccess: async (_data, { organizationId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(organizationId) })
    },
  })
}
