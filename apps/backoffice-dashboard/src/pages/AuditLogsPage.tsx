/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Label } from '@dashboard/ui/label'
import { Switch } from '@dashboard/ui/switch'
import { DateRangePicker } from '@dashboard/ui/date-range-picker'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@dashboard/ui/tooltip'
import BackofficeApiClient from '@backoffice/api/BackofficeApiClient'
import { getRelativeTimeString } from '@backoffice/lib/utils'
import { AuditLogResponseDto } from '@daytonaio/backoffice-api-client'
import { DateRange } from 'react-day-picker'

const getOutcome = (statusCode?: number) => {
  if (!statusCode) return { text: 'Unknown', color: 'text-gray-600' }
  if (statusCode >= 200 && statusCode < 300) return { text: 'Success', color: 'text-green-600' }
  if (statusCode >= 400 && statusCode < 500) return { text: 'Client Error', color: 'text-red-600' }
  if (statusCode >= 500) return { text: 'Server Error', color: 'text-red-600' }
  return { text: 'Unknown', color: 'text-gray-600' }
}

const quickRanges = {
  minutes: [5, 15, 30],
  hours: [1, 3, 6, 12],
  days: [1, 2, 7, 30, 90],
  months: [6],
  years: [1],
}

export const AuditLogsPage = () => {
  const [data, setData] = useState<{ logs: AuditLogResponseDto[]; total: number }>({ logs: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 })

  const fetchData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true)
      try {
        const response = await BackofficeApiClient.searchAuditLogs({
          page: pagination.page,
          pageSize: pagination.pageSize,
          filters: {
            startDate: dateRange.from,
            endDate: dateRange.to,
          },
        })
        if (response.success) {
          setData({ logs: response.data.logs, total: response.pagination.total || 0 })
        }
      } catch (error) {
        toast.error('Failed to fetch audit logs')
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [pagination, dateRange],
  )

  // Initial load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => fetchData(false), 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const handlePaginationChange = (newPage: number, newPageSize: number) => {
    setPagination({ page: newPage, pageSize: newPageSize })
  }

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range)
    setPagination((prev) => ({ ...prev, page: 1 })) // Reset to page 1 on filter change
  }

  const columns: Column<AuditLogResponseDto>[] = [
    {
      key: 'time',
      title: 'Time',
      width: '200px',
      render: (log) => (
        <div className="space-y-1">
          <div className="font-medium truncate">{getRelativeTimeString(log.createdAt).relativeTimeString}</div>
          <div className="text-sm text-muted-foreground truncate">{new Date(log.createdAt).toLocaleString()}</div>
        </div>
      ),
    },
    {
      key: 'user',
      title: 'User',
      width: '240px',
      render: (log) => {
        const user = log.actorEmail || log.actorId
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="truncate">{user}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{user}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      key: 'action',
      title: 'Action',
      width: '240px',
      render: (log) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="truncate">{log.action}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{log.action}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
    {
      key: 'target',
      title: 'Target',
      width: '360px',
      render: (log) => {
        const targetId = log.targetId || '-'
        const ids = targetId.split(',')
        const hasMultipleIds = ids.length > 1
        const displayId = hasMultipleIds ? `${ids[0]}... (+${ids.length - 1} more)` : targetId

        return (
          <div className="space-y-1">
            <div className="truncate">{log.targetType || '-'}</div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-sm text-muted-foreground truncate">{displayId}</div>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div className="space-y-1">
                    {ids.map((id, idx) => (
                      <p key={idx} className="font-mono text-xs">
                        {id.trim()}
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )
      },
    },
    {
      key: 'outcome',
      title: 'Outcome',
      width: '320px',
      render: (log) => {
        const outcome = getOutcome(log.statusCode)
        return (
          <div className="space-y-1">
            <div className={`font-medium ${outcome.color}`}>{outcome.text}</div>
            {log.statusCode && <div className="text-sm text-muted-foreground">Status: {log.statusCode}</div>}
          </div>
        )
      },
    },
  ]

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Audit Logs</PageTitle>
        <div className="flex items-center gap-4 ml-auto">
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            quickRangesEnabled={true}
            quickRanges={quickRanges}
            timeSelection={false}
            className="w-[280px]"
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-refresh">Auto-refresh:</Label>
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
        </div>
      </PageHeader>
      <PageContent size="full">
        <DataTable
          columns={columns}
          data={data.logs}
          loading={loading}
          rowKey={(log) => log.id}
          pagination={{
            page: pagination.page,
            pageSize: pagination.pageSize,
            total: data.total,
            pageSizeOptions: [10, 15, 20],
          }}
          onPaginationChange={handlePaginationChange}
        />
      </PageContent>
    </PageLayout>
  )
}
