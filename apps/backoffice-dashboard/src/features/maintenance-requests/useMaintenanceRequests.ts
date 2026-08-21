import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { useHasPermission } from '../../providers/ApiProvider'

export const useMaintenanceRequest = (id: string) =>
  useQuery({
    queryKey: ['maintenance-requests', 'detail', id],
    queryFn: () => BackofficeApiClient.getMaintenanceRequest(id),
    enabled: !!id,
    refetchInterval: 30 * 1000,
  })

/** Incoming requests for the notifications feed (bell + tab). Needs fleet:read. */
export const useIncomingMaintenanceRequests = () => {
  const canRead = useHasPermission('fleet', 'read')
  return useQuery({
    // canRead is part of the key so a permission downgrade cannot keep
    // serving previously fetched data from the cache.
    queryKey: ['maintenance-requests', 'incoming', canRead],
    queryFn: () => BackofficeApiClient.listIncomingMaintenanceRequests(),
    enabled: canRead,
    refetchInterval: 60 * 1000,
  })
}
