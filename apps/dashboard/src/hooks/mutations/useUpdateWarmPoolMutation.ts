import { UpdateWarmPool, WarmPool } from '@daytona/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

export interface UpdateWarmPoolMutationVariables {
  warmPoolId: string
  warmPool: UpdateWarmPool
  organizationId?: string
}

export const useUpdateWarmPoolMutation = () => {
  const { warmPoolsApi } = useApi()
  const queryClient = useQueryClient()

  return useMutation<WarmPool, unknown, UpdateWarmPoolMutationVariables>({
    mutationFn: async ({ warmPoolId, warmPool, organizationId }) => {
      if (!organizationId) {
        throw new Error('No organization selected')
      }
      const response = await warmPoolsApi.updateWarmPool(warmPoolId, warmPool, organizationId)
      return response.data
    },
    onSuccess: async (_data, { organizationId }) => {
      if (organizationId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.warmPools.list(organizationId) })
      }
    },
  })
}
