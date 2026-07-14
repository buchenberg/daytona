import type { AvailableSandboxClass } from '@daytona/api-client'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { queryKeys } from './queryKeys'

export const useAvailableSandboxClassesQuery = (
  { organizationId }: { organizationId: string },
  options?: Omit<Parameters<typeof useQuery<AvailableSandboxClass[]>>[0], 'queryKey' | 'queryFn'>,
) => {
  const { organizationsApi } = useApi()

  return useQuery<AvailableSandboxClass[]>({
    queryKey: queryKeys.organization.availableSandboxClasses(organizationId),
    queryFn: async () => (await organizationsApi.listAvailableSandboxClasses(organizationId)).data,
    enabled: !!organizationId,
    ...options,
  })
}
