import type { AccountProvider } from '@daytona/api-client'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { queryKeys } from './queryKeys'

export const useAccountProvidersQuery = () => {
  const { userApi } = useApi()

  return useQuery<AccountProvider[]>({
    queryKey: queryKeys.user.accountProviders(),
    queryFn: async () => userApi.getAvailableAccountProviders().then((response) => response.data),
  })
}
