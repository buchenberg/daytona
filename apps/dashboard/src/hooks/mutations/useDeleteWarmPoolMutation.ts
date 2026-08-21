import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

export interface DeleteWarmPoolMutationVariables {
  warmPoolId: string
  organizationId?: string
}

interface UseDeleteWarmPoolMutationOptions {
  invalidateOnSuccess?: boolean
}

export const useDeleteWarmPoolMutation = ({ invalidateOnSuccess = true }: UseDeleteWarmPoolMutationOptions = {}) => {
  const { warmPoolsApi } = useApi()
  const queryClient = useQueryClient()

  return useMutation<void, unknown, DeleteWarmPoolMutationVariables>({
    mutationFn: async ({ warmPoolId, organizationId }) => {
      if (!organizationId) {
        throw new Error('No organization selected')
      }
      await warmPoolsApi.deleteWarmPool(warmPoolId, organizationId)
    },
    onSuccess: async (_data, { organizationId }) => {
      if (invalidateOnSuccess && organizationId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.warmPools.list(organizationId) })
      }
    },
  })
}
