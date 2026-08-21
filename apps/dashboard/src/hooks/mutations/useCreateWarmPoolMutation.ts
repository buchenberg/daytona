import { CreateWarmPool, WarmPool } from '@daytona/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

export interface CreateWarmPoolMutationVariables {
  warmPool: CreateWarmPool
  organizationId?: string
}

export const useCreateWarmPoolMutation = () => {
  const { warmPoolsApi } = useApi()
  const queryClient = useQueryClient()

  return useMutation<WarmPool, unknown, CreateWarmPoolMutationVariables>({
    mutationFn: async ({ warmPool, organizationId }) => {
      if (!organizationId) {
        throw new Error('No organization selected')
      }
      const response = await warmPoolsApi.createWarmPool(warmPool, organizationId)
      return response.data
    },
    onSuccess: async (_data, { organizationId }) => {
      if (organizationId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.warmPools.list(organizationId) })
      }
    },
  })
}
