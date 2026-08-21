import { queryKeys } from '@/hooks/queries/queryKeys'
import { useNotificationSocket } from '@/hooks/useNotificationSocket'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { Sandbox } from '@daytona/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

// Coalesce a burst (filling a pool of 100 emits ~100 events) into one refetch: fire after events
// stop, but at least every MAX_WAIT_MS so the count still climbs live during a long fill.
const DEBOUNCE_MS = 400
const MAX_WAIT_MS = 2000

// Warm members are sandboxes, so their lifecycle surfaces as ordinary sandbox notifications. React
// only to pool members and refetch the pool list (WS-driven, like the other resource lists). A claim
// clears warmPoolId so it's skipped, but the cron refill's fresh `created` reconciles the count.
export function useWarmPoolWsSync() {
  const { notificationSocket } = useNotificationSocket()
  const { selectedOrganization } = useSelectedOrganization()
  const queryClient = useQueryClient()
  const debounceRef = useRef<number | undefined>(undefined)
  const maxWaitRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!notificationSocket || !selectedOrganization?.id) return

    const queryKey = queryKeys.warmPools.list(selectedOrganization.id)

    const flush = () => {
      window.clearTimeout(debounceRef.current)
      window.clearTimeout(maxWaitRef.current)
      debounceRef.current = undefined
      maxWaitRef.current = undefined
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
    }

    const scheduleRefetch = () => {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(flush, DEBOUNCE_MS)
      if (maxWaitRef.current === undefined) {
        maxWaitRef.current = window.setTimeout(flush, MAX_WAIT_MS)
      }
    }

    const onCreated = (sandbox: Sandbox) => {
      if (sandbox?.warmPoolId) scheduleRefetch()
    }
    const onUpdated = (data: { sandbox: Sandbox }) => {
      if (data?.sandbox?.warmPoolId) scheduleRefetch()
    }

    notificationSocket.on('sandbox.created', onCreated)
    notificationSocket.on('sandbox.state.updated', onUpdated)
    notificationSocket.on('sandbox.desired-state.updated', onUpdated)

    return () => {
      window.clearTimeout(debounceRef.current)
      window.clearTimeout(maxWaitRef.current)
      debounceRef.current = undefined
      maxWaitRef.current = undefined
      notificationSocket.off('sandbox.created', onCreated)
      notificationSocket.off('sandbox.state.updated', onUpdated)
      notificationSocket.off('sandbox.desired-state.updated', onUpdated)
    }
  }, [notificationSocket, queryClient, selectedOrganization?.id])
}
