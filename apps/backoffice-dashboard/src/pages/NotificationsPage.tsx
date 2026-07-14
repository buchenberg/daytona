import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Check, X, RefreshCw, Bell } from 'lucide-react'
import { PageLayout, PageHeaderBase, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { Button } from '@dashboard/ui/button'
import { Badge } from '@dashboard/ui/badge'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { TruncatedText } from '@backoffice/components/TruncatedText'
import { handleUpdateError } from '../lib/api'
import BackofficeApiClient from '../api/BackofficeApiClient'
import { useHasPermission, useUser } from '../providers/ApiProvider'
import { usePendingQuotaRequests } from '../features/quota-requests/useQuotaRequests'
import { QuotaRequestDto } from '../types/quota-requests'

const hoursLeft = (expiresAt: string): string => {
  const diffMs = dayjs(expiresAt).diff(dayjs())
  if (diffMs <= 0) return 'expiring'
  const hours = Math.floor(diffMs / 3_600_000)
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const delta = (n: number) => (n > 0 ? `+${n}` : '—')

export const NotificationsPage = () => {
  const { data, isLoading, isFetching, refetch } = usePendingQuotaRequests()
  const canWrite = useHasPermission('regionQuotas', 'write')
  const currentUserId = useUser()?.id
  const [actingIds, setActingIds] = useState<ReadonlySet<string>>(new Set())
  const queryClient = useQueryClient()

  const requests = data?.data?.requests ?? []

  const act = async (id: string, action: 'approve' | 'reject' | 'cancel') => {
    try {
      setActingIds((prev) => new Set(prev).add(id))
      if (action === 'approve') {
        await BackofficeApiClient.approveQuotaRequest(id)
        toast.success('Request approved — change is now permanent')
      } else if (action === 'reject') {
        await BackofficeApiClient.rejectQuotaRequest(id)
        toast.success('Request rejected — quota reverted')
      } else {
        await BackofficeApiClient.cancelQuotaRequest(id)
        toast.success('Request cancelled — quota reverted')
      }
      await queryClient.invalidateQueries({ queryKey: ['quota-requests'] })
      await queryClient.invalidateQueries({ queryKey: ['region-quotas'] })
      refetch()
    } catch (error) {
      handleUpdateError(error, `Failed to ${action} request`)
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const columns: Column<QuotaRequestDto>[] = [
    {
      key: 'target',
      title: 'Organization / Region',
      width: '240px',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">
            <TruncatedText text={r.organizationId} maxLength={28} />
          </span>
          <span className="text-sm">
            {r.regionId} · <span className="text-muted-foreground">{r.sandboxClass}</span>
          </span>
          {r.kind === 'create' && (
            <Badge variant="secondary" className="mt-1 w-fit">
              created quota
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'increase',
      title: 'Increase (before → after)',
      width: '220px',
      render: (r) => (
        <div className="flex flex-col text-xs leading-tight">
          <span>
            cpu {delta(r.cpuDelta)} ({r.cpuBefore}→{r.cpuAfter})
          </span>
          <span>
            mem {delta(r.memoryDelta)} ({r.memoryBefore}→{r.memoryAfter})
          </span>
          <span>
            disk {delta(r.diskDelta)} ({r.diskBefore}→{r.diskAfter})
          </span>
          {r.gpuDelta > 0 && (
            <span>
              gpu {delta(r.gpuDelta)} ({r.gpuBefore}→{r.gpuAfter})
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'requestedBy',
      title: 'Requested by',
      width: '180px',
      render: (r) => <span className="text-sm">{r.requestedByEmail}</span>,
    },
    {
      key: 'reason',
      title: 'Reason',
      width: '220px',
      render: (r) => <span className="text-xs text-muted-foreground">{r.reason || '—'}</span>,
    },
    {
      key: 'expiresAt',
      title: 'Reverts in',
      width: '110px',
      render: (r) => <Badge variant="outline">{hoursLeft(r.expiresAt)}</Badge>,
    },
  ]

  // regionQuotas:write users can approve/reject; requesters can cancel their own
  // pending request. Everyone else sees a read-only list.
  const canCancelOwn = requests.some((r) => r.requestedById === currentUserId)
  if (canWrite || canCancelOwn) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '220px',
      render: (r) => (
        <div className="flex gap-2">
          {canWrite && (
            <>
              <Button size="sm" variant="default" disabled={actingIds.has(r.id)} onClick={() => act(r.id, 'approve')}>
                <Check className="mr-1 h-3 w-3" />
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={actingIds.has(r.id)} onClick={() => act(r.id, 'reject')}>
                <X className="mr-1 h-3 w-3" />
                Reject
              </Button>
            </>
          )}
          {r.requestedById === currentUserId && (
            <Button size="sm" variant="outline" disabled={actingIds.has(r.id)} onClick={() => act(r.id, 'cancel')}>
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          )}
        </div>
      ),
    })
  }

  return (
    <PageLayout>
      <PageHeaderBase>
        <PageTitle>Notifications</PageTitle>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="ml-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </PageHeaderBase>
      <PageContent size="full">
        {!isLoading && requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Bell className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notifications</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Quota updates and creates requested by support. Approve to keep them permanently, or reject to revert now.
              Anything left untouched auto-reverts when it expires.
            </p>
            <DataTable columns={columns} data={requests} loading={isLoading} rowKey={(r) => r.id} />
          </>
        )}
      </PageContent>
    </PageLayout>
  )
}
