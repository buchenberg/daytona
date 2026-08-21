import { WarmPool } from '@daytona/api-client'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { useSelectedOrganization } from '../useSelectedOrganization'
import { queryKeys } from './queryKeys'

export function useWarmPoolsQuery() {
  const { warmPoolsApi } = useApi()
  const { selectedOrganization } = useSelectedOrganization()

  return useQuery<WarmPool[]>({
    queryKey: queryKeys.warmPools.list(selectedOrganization?.id ?? ''),
    queryFn: async () => {
      if (!selectedOrganization) {
        throw new Error('No organization selected')
      }

      const response = await warmPoolsApi.listWarmPools(selectedOrganization.id)
      return response.data
    },
    enabled: !!selectedOrganization,
    // Ready count is kept live by useWarmPoolWsSync (sandbox WS events), like the other resource lists.
  })
}
