/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

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
import { usePendingQuotaBumps } from '../features/quota-bumps/useQuotaBumps'
import { QuotaBumpRequestDto } from '../types/quota-bumps'

const hoursLeft = (expiresAt: string): string => {
  const diffMs = dayjs(expiresAt).diff(dayjs())
  if (diffMs <= 0) return 'expiring'
  const hours = Math.floor(diffMs / 3_600_000)
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const delta = (n: number) => (n > 0 ? `+${n}` : '—')

export const NotificationsPage = () => {
  const { data, isLoading, isFetching, refetch } = usePendingQuotaBumps()
  const canWrite = useHasPermission('regionQuotas', 'write')
  const currentUserId = useUser()?.id
  const [actingIds, setActingIds] = useState<ReadonlySet<string>>(new Set())
  const queryClient = useQueryClient()

  const bumps = data?.data?.bumps ?? []

  const act = async (id: string, action: 'approve' | 'reject' | 'cancel') => {
    try {
      setActingIds((prev) => new Set(prev).add(id))
      if (action === 'approve') {
        await BackofficeApiClient.approveQuotaBump(id)
        toast.success('Bump approved — increase is now permanent')
      } else if (action === 'reject') {
        await BackofficeApiClient.rejectQuotaBump(id)
        toast.success('Bump rejected — quota reverted')
      } else {
        await BackofficeApiClient.cancelQuotaBump(id)
        toast.success('Bump cancelled — quota reverted')
      }
      await queryClient.invalidateQueries({ queryKey: ['quota-bumps'] })
      await queryClient.invalidateQueries({ queryKey: ['region-quotas'] })
      refetch()
    } catch (error) {
      handleUpdateError(error, `Failed to ${action} bump`)
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const columns: Column<QuotaBumpRequestDto>[] = [
    {
      key: 'target',
      title: 'Organization / Region',
      width: '240px',
      render: (b) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">
            <TruncatedText text={b.organizationId} maxLength={28} />
          </span>
          <span className="text-sm">
            {b.regionId} · <span className="text-muted-foreground">{b.sandboxClass}</span>
          </span>
        </div>
      ),
    },
    {
      key: 'increase',
      title: 'Increase (before → after)',
      width: '220px',
      render: (b) => (
        <div className="flex flex-col text-xs leading-tight">
          <span>
            cpu {delta(b.cpuDelta)} ({b.cpuBefore}→{b.cpuAfter})
          </span>
          <span>
            mem {delta(b.memoryDelta)} ({b.memoryBefore}→{b.memoryAfter})
          </span>
          <span>
            disk {delta(b.diskDelta)} ({b.diskBefore}→{b.diskAfter})
          </span>
        </div>
      ),
    },
    {
      key: 'requestedBy',
      title: 'Requested by',
      width: '180px',
      render: (b) => <span className="text-sm">{b.requestedByEmail}</span>,
    },
    {
      key: 'reason',
      title: 'Reason',
      width: '220px',
      render: (b) => <span className="text-xs text-muted-foreground">{b.reason || '—'}</span>,
    },
    {
      key: 'expiresAt',
      title: 'Reverts in',
      width: '110px',
      render: (b) => <Badge variant="outline">{hoursLeft(b.expiresAt)}</Badge>,
    },
  ]

  // regionQuotas:write users can approve/reject; requesters can cancel their own
  // pending bump. Everyone else sees a read-only list.
  const canCancelOwn = bumps.some((b) => b.requestedById === currentUserId)
  if (canWrite || canCancelOwn) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '220px',
      render: (b) => (
        <div className="flex gap-2">
          {canWrite && (
            <>
              <Button size="sm" variant="default" disabled={actingIds.has(b.id)} onClick={() => act(b.id, 'approve')}>
                <Check className="mr-1 h-3 w-3" />
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={actingIds.has(b.id)} onClick={() => act(b.id, 'reject')}>
                <X className="mr-1 h-3 w-3" />
                Reject
              </Button>
            </>
          )}
          {b.requestedById === currentUserId && (
            <Button size="sm" variant="outline" disabled={actingIds.has(b.id)} onClick={() => act(b.id, 'cancel')}>
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
        {!isLoading && bumps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Bell className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notifications</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Temporary quota bumps made by support. Approve to keep the increase permanently, or reject to revert it
              now. Anything left untouched auto-reverts when it expires.
            </p>
            <DataTable columns={columns} data={bumps} loading={isLoading} rowKey={(b) => b.id} />
          </>
        )}
      </PageContent>
    </PageLayout>
  )
}
