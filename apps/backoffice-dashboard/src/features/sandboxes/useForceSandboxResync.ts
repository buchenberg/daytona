import { useMutation } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { SandboxResyncResponse } from '../../types'

export const useForceSandboxOrganizationResync = () => {
  return useMutation<SandboxResyncResponse, unknown, { sandboxId: string }>({
    mutationKey: ['sandbox-force-organization-resync'],
    mutationFn: ({ sandboxId }) => BackofficeApiClient.forceOrganizationResyncForSandbox(sandboxId),
  })
}
