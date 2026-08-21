import { useApi } from '@/hooks/useApi'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useMutation } from '@tanstack/react-query'

interface RevokeSshAccessVariables {
  sandboxId: string
  token: string
}

export const useRevokeSshAccessMutation = () => {
  const { sandboxApi } = useApi()
  const { selectedOrganization } = useSelectedOrganization()

  return useMutation({
    mutationFn: async ({ sandboxId, token }: RevokeSshAccessVariables) => {
      await sandboxApi.revokeSshAccess(sandboxId, selectedOrganization?.id, token)
    },
  })
}
