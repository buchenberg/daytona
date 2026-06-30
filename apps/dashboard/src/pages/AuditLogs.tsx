/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AuditLogTable } from '@/components/AuditLogTable'
import { AuditLogDetailSheet } from '@/components/audit-logs/AuditLogDetailSheet'
import { type AuditFilterRule } from '@/components/audit-logs/auditLogFilterConfig'
import { buildAuditLogFilterParams, parseAsAuditFilters } from '@/components/audit-logs/auditLogFilterParams'
import { PageContent, PageFooter, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { RefreshSegmentedButton } from '@/components/RefreshSegmentedButton'
import { DEFAULT_PAGE_SIZE } from '@/constants/Pagination'
import { useAuditLogsQuery, type AuditLogsQueryParams } from '@/hooks/queries/useAuditLogsQuery'
import { handleApiError } from '@/lib/error-handling'
import { AuditLog, PaginatedAuditLogs } from '@daytona/api-client'
import { parseAsIsoDateTime, parseAsString, useQueryState, useQueryStates } from 'nuqs'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DateRange } from 'react-day-picker'

const EMPTY_AUDIT_LOGS: PaginatedAuditLogs = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 0,
  nextToken: undefined,
}

interface AuditLogsPaginationState {
  pageIndex: number
  pageSize: number
  cursors: Record<number, string>
}

function useAuditLogsPagination(initialPageSize: number) {
  const [pagination, setPagination] = useState<AuditLogsPaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
    cursors: {},
  })

  const currentCursor = pagination.cursors[pagination.pageIndex]

  const resetPagination = useCallback(() => {
    setPagination({
      pageIndex: 0,
      pageSize: initialPageSize,
      cursors: {},
    })
  }, [initialPageSize])

  const setPageSize = useCallback((pageSize: number) => {
    setPagination({
      pageIndex: 0,
      pageSize,
      cursors: {},
    })
  }, [])

  const setOffsetPage = useCallback((pageIndex: number, pageSize: number) => {
    setPagination({
      pageIndex,
      pageSize,
      cursors: {},
    })
  }, [])

  const goNextWithCursor = useCallback((nextCursor: string) => {
    setPagination((prev) => {
      const nextPageIndex = prev.pageIndex + 1
      return {
        ...prev,
        pageIndex: nextPageIndex,
        cursors: {
          ...prev.cursors,
          [nextPageIndex]: nextCursor,
        },
      }
    })
  }, [])

  const goPreviousPage = useCallback(() => {
    setPagination((prev) => {
      if (prev.pageIndex === 0) {
        return prev
      }

      const nextPageIndex = prev.pageIndex - 1
      const nextCursors = { ...prev.cursors }
      delete nextCursors[prev.pageIndex]

      return {
        ...prev,
        pageIndex: nextPageIndex,
        cursors: nextCursors,
      }
    })
  }, [])

  return {
    pagination,
    currentCursor,
    resetPagination,
    setPageSize,
    setOffsetPage,
    goNextWithCursor,
    goPreviousPage,
  }
}

const DATE_RANGE_SEARCH_PARAMS = {
  from: parseAsIsoDateTime,
  to: parseAsIsoDateTime,
}

const AuditLogs: React.FC = () => {
  const [refreshInterval, setRefreshInterval] = useState<number | false>(false)
  const [rules, setRules] = useQueryState('filters', parseAsAuditFilters)
  const [{ from, to }, setDateRangeParams] = useQueryStates(DATE_RANGE_SEARCH_PARAMS)
  const { pagination, currentCursor, resetPagination, setPageSize, setOffsetPage, goNextWithCursor, goPreviousPage } =
    useAuditLogsPagination(DEFAULT_PAGE_SIZE)
  const scrollToTableTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const dateRange = useMemo<DateRange>(() => ({ from: from ?? undefined, to: to ?? undefined }), [from, to])

  const filterParams = useMemo<Record<string, string>>(() => {
    const params = buildAuditLogFilterParams(rules)
    if (from) {
      params['createdAt[gte]'] = from.toISOString()
    }
    if (to) {
      params['createdAt[lte]'] = to.toISOString()
    }
    return params
  }, [rules, from, to])
  const filterParamsKey = useMemo(() => JSON.stringify(filterParams), [filterParams])

  const isInitialFilterRender = React.useRef(true)
  useEffect(() => {
    if (isInitialFilterRender.current) {
      isInitialFilterRender.current = false
      return
    }
    resetPagination()
  }, [filterParamsKey, resetPagination])

  const queryParams = useMemo<AuditLogsQueryParams>(
    () => ({
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      cursor: currentCursor,
      filterParams,
    }),
    [pagination.pageIndex, pagination.pageSize, currentCursor, filterParams],
  )

  const {
    data = EMPTY_AUDIT_LOGS,
    isLoading,
    isRefetching,
    isPlaceholderData,
    error,
    refetch,
    dataUpdatedAt,
  } = useAuditLogsQuery(queryParams, {
    refetchInterval: refreshInterval,
  })

  const handlePaginationChange = useCallback(
    ({ pageIndex, pageSize }: { pageIndex: number; pageSize: number }) => {
      if (isPlaceholderData) {
        return
      }

      if (pageSize !== pagination.pageSize) {
        scrollToTableTop()
        setPageSize(pageSize)
        return
      }

      const pageDelta = pageIndex - pagination.pageIndex

      if (pageDelta === 0) {
        return
      }

      if (Math.abs(pageDelta) > 1) {
        scrollToTableTop()
        setOffsetPage(pageIndex, pageSize)
        return
      }

      if (pageDelta > 0) {
        scrollToTableTop()
        if (data.nextToken) {
          goNextWithCursor(data.nextToken)
        } else {
          setOffsetPage(pageIndex, pageSize)
        }
        return
      }

      scrollToTableTop()
      if (currentCursor !== undefined) {
        goPreviousPage()
      } else {
        setOffsetPage(pageIndex, pageSize)
      }
    },
    [
      isPlaceholderData,
      pagination.pageIndex,
      pagination.pageSize,
      currentCursor,
      goNextWithCursor,
      goPreviousPage,
      setOffsetPage,
      setPageSize,
      scrollToTableTop,
      data.nextToken,
    ],
  )

  useEffect(() => {
    if (error) {
      handleApiError(error, 'Failed to fetch audit logs', { toastId: 'audit-logs-fetch' })
    }
  }, [error])

  useEffect(() => {
    if (!isLoading && data.items.length === 0 && pagination.pageIndex > 0) {
      goPreviousPage()
    }
  }, [isLoading, data.items.length, pagination.pageIndex, goPreviousPage])

  const handleDateRangeChange = useCallback(
    (range: DateRange) => {
      setDateRangeParams({ from: range.from ?? null, to: range.to ?? null })
    },
    [setDateRangeParams],
  )

  const hasFilters = rules.length > 0 || Boolean(from || to)

  const handleRulesChange = useCallback(
    (next: AuditFilterRule[]) => {
      setRules(next.length > 0 ? next : null)
    },
    [setRules],
  )

  const handleClearFilters = useCallback(() => {
    setRules(null)
    setDateRangeParams({ from: null, to: null })
  }, [setRules, setDateRangeParams])

  const [openLogId, setOpenLogId] = useQueryState('auditLogId', parseAsString)
  const [seedLog, setSeedLog] = useState<AuditLog | null>(null)

  const handleRowClick = useCallback(
    (log: AuditLog) => {
      setSeedLog(log)
      setOpenLogId(log.id)
    },
    [setOpenLogId],
  )

  const selectedLogIndex = useMemo(
    () => (openLogId ? data.items.findIndex((item) => item.id === openLogId) : -1),
    [openLogId, data.items],
  )

  const handleNavigateLog = useCallback(
    (direction: 'prev' | 'next') => {
      if (selectedLogIndex < 0) {
        return
      }
      const nextIndex = direction === 'prev' ? selectedLogIndex - 1 : selectedLogIndex + 1
      const nextLog = data.items[nextIndex]
      if (nextLog) {
        setSeedLog(nextLog)
        setOpenLogId(nextLog.id)
      }
    },
    [selectedLogIndex, data.items, setOpenLogId],
  )

  const handleApplyFilter = useCallback(
    (field: string, value: string) => {
      const rule: AuditFilterRule = { field, operator: 'eq', value: [value] }
      const existingIndex = rules.findIndex((entry) => entry.field === field)
      const next =
        existingIndex >= 0 ? rules.map((entry, index) => (index === existingIndex ? rule : entry)) : [...rules, rule]
      setRules(next)
    },
    [rules, setRules],
  )

  return (
    <PageLayout contained>
      <PageHeader />

      <PageContent size="full" className="overflow-hidden">
        <PageIntro title="Audit Logs" />
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <AuditLogTable
            data={data.items}
            loading={isLoading}
            isRefetching={isRefetching}
            hasFilters={hasFilters}
            onClearFilters={handleClearFilters}
            pageCount={data.totalPages}
            totalItems={data.total}
            onPaginationChange={handlePaginationChange}
            pagination={{
              pageIndex: pagination.pageIndex,
              pageSize: pagination.pageSize,
            }}
            rules={rules}
            onRulesChange={handleRulesChange}
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            filtersDisabled={isLoading}
            onRowClick={handleRowClick}
            selectedRowId={openLogId}
            refreshControl={
              <RefreshSegmentedButton
                value={refreshInterval}
                onChange={setRefreshInterval}
                onRefresh={refetch}
                isRefreshing={isRefetching}
                lastUpdatedAt={dataUpdatedAt}
              />
            }
          />
        </div>
      </PageContent>
      <PageFooter />

      <AuditLogDetailSheet
        open={Boolean(openLogId)}
        auditLogId={openLogId}
        // Not gated on openLogId so the seed stays mounted through the close animation.
        seedLog={seedLog ?? undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpenLogId(null)
          }
        }}
        onApplyFilter={handleApplyFilter}
        onNavigate={handleNavigateLog}
        hasPrev={selectedLogIndex > 0}
        hasNext={selectedLogIndex >= 0 && selectedLogIndex < data.items.length - 1}
      />
    </PageLayout>
  )
}

export default AuditLogs
