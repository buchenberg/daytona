import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { FolderSync } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { cn } from '@backoffice/lib/utils'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { handleUpdateError } from '../../lib/api'
import { useHasPermission } from '../../providers/ApiProvider'
import { useFleetSyncStatus } from './useFleet'

/** Inventory sync freshness + a manual "sync now" for fleet:write users. */
export const SyncStatus = () => {
  const { data: status } = useFleetSyncStatus()
  const canWrite = useHasPermission('fleet', 'write')
  const [syncing, setSyncing] = useState(false)
  const queryClient = useQueryClient()

  const label = !status
    ? ''
    : status.state === 'running'
      ? 'syncing…'
      : status.state === 'error'
        ? `sync failed ${dayjs(status.finishedAt).fromNow()}`
        : status.state === 'ok'
          ? `synced ${dayjs(status.finishedAt).fromNow()} · ${status.hosts} hosts`
          : 'never synced'

  const triggerSync = async () => {
    try {
      setSyncing(true)
      const result = await BackofficeApiClient.triggerFleetSync()
      // The endpoint returns immediately when a sync was already in flight
      if (result.state === 'running') {
        toast.info('Inventory sync already in progress')
      } else {
        toast.success('Inventory synced')
      }
      await queryClient.invalidateQueries({ queryKey: ['fleet-runners'] })
      await queryClient.invalidateQueries({ queryKey: ['fleet-sync-status'] })
    } catch (error) {
      handleUpdateError(error, 'Inventory sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <span
        className={cn('text-xs', status?.state === 'error' ? 'text-destructive' : 'text-muted-foreground')}
        title={status?.error ?? undefined}
      >
        {label}
      </span>
      {canWrite && (
        <Button variant="outline" size="sm" onClick={triggerSync} disabled={syncing || status?.state === 'running'}>
          <FolderSync className={cn('mr-2 h-4 w-4', syncing && 'animate-spin')} />
          Sync now
        </Button>
      )}
    </div>
  )
}
