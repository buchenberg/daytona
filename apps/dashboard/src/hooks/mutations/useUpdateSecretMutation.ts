import { Secret } from '@daytona/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

export interface UpdateSecretMutationVariables {
  secretId: string
  value?: string
  description?: string
  hosts?: string[]
  organizationId: string
}

export const useUpdateSecretMutation = () => {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation<Secret, unknown, UpdateSecretMutationVariables>({
    mutationFn: async ({ secretId, organizationId, value, description, hosts }) => {
      const response = await api.secretApi.updateSecret(secretId, { value, description, hosts }, organizationId)
      return response.data
    },
    onSuccess: async (_data, { organizationId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(organizationId) })
    },
  })
}
