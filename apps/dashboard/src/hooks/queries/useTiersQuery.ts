import type { Tier } from '@daytona/billing-api-client'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { useConfig } from '../useConfig'
import { queryKeys } from './queryKeys'

export const useTiersQuery = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const { billingApi } = useApi()
  const config = useConfig()

  return useQuery<Tier[]>({
    queryKey: queryKeys.billing.tiers(),
    queryFn: () => billingApi.listTiers(),
    enabled: Boolean(enabled && config.billingApiUrl),
  })
}
