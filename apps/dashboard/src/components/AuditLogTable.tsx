/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { EllipsisWithTooltip } from '@/components/EllipsisWithTooltip'
import { PageFooterPortal } from '@/components/PageLayout'
import { TimestampTooltip } from '@/components/TimestampTooltip'
import { Pagination } from '@/components/Pagination'
import { AuditLogTableHeader } from '@/components/audit-logs/AuditLogTableHeader'
import type { AuditFilterRule } from '@/components/audit-logs/auditLogFilterConfig'
import { getOutcomeInfo } from '@/components/audit-logs/auditLogOutcome'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DEFAULT_PAGE_SIZE } from '@/constants/TableDefaults'
import { cn, getMaskedTokenFromParts, getRelativeTimeString } from '@/lib/utils'
import { DEFAULT_TABLE_COLUMN, getColumnSizeStyles, getTableSizeStyles } from '@/lib/utils/table'
import { AuditLog } from '@daytona/api-client'
import { Column, ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { TextSearch } from 'lucide-react'
import { type ReactNode } from 'react'
import { DateRange } from 'react-day-picker'

interface Props {
  data: AuditLog[]
  loading: boolean
  isRefetching?: boolean
  pagination: {
    pageIndex: number
    pageSize: number
  }
  pageCount: number
  totalItems: number
  onPaginationChange: (pagination: { pageIndex: number; pageSize: number }) => void
  hasFilters?: boolean
  onClearFilters?: () => void
  rules: AuditFilterRule[]
  onRulesChange: (rules: AuditFilterRule[]) => void
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  filtersDisabled?: boolean
  refreshControl?: ReactNode
  onRowClick?: (log: AuditLog) => void
  selectedRowId?: string | null
}

export function AuditLogTable({
  data,
  loading,
  isRefetching = false,
  pagination,
  pageCount,
  onPaginationChange,
  totalItems,
  hasFilters = false,
  onClearFilters,
  rules,
  onRulesChange,
  dateRange,
  onDateRangeChange,
  filtersDisabled = false,
  refreshControl,
  onRowClick,
  selectedRowId,
}: Props) {
  const table = useReactTable({
    columnResizeMode: 'onEnd',
    data,
    columns: auditLogColumns,
    defaultColumn: DEFAULT_TABLE_COLUMN,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pageCount || 1,
    onPaginationChange: pagination
      ? (updater) => {
          const newPagination = typeof updater === 'function' ? updater(table.getState().pagination) : updater
          onPaginationChange(newPagination)
        }
      : undefined,
    state: {
      pagination: {
        pageIndex: pagination?.pageIndex || 0,
        pageSize: pagination?.pageSize || 10,
      },
    },
    getRowId: (row) => row.id,
  })

  const isEmpty = !loading && table.getRowModel().rows.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <AuditLogTableHeader
        table={table}
        rules={rules}
        onRulesChange={onRulesChange}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onClearFilters={onClearFilters}
        disabled={filtersDisabled}
        refreshControl={refreshControl}
      />
      <TableContainer
        className={cn({
          'min-h-[26rem]': isEmpty,
        })}
        empty={
          isEmpty ? (
            <TableEmptyState
              overlay
              colSpan={auditLogColumns.length}
              message={hasFilters ? 'No matching logs found.' : 'No logs yet.'}
              icon={<TextSearch />}
              description={
                hasFilters ? null : (
                  <p>Audit logs are detailed records of all actions taken by users in the organization.</p>
                )
              }
              action={
                hasFilters && onClearFilters ? (
                  <Button variant="outline" onClick={onClearFilters}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : null
        }
      >
        <Table className="table-fixed" style={getTableSizeStyles(table)}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      header={header}
                      sticky={isEmpty ? undefined : header.column.getIsPinned()}
                      style={isEmpty ? undefined : getColumnSizeStyles(header.column)}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <AuditLogTableSkeleton columns={table.getVisibleLeafColumns()} />
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-selected={selectedRowId === row.id ? true : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn({
                    'opacity-70 transition-opacity': isRefetching,
                    'cursor-pointer': onRowClick,
                  })}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      sticky={cell.column.getIsPinned()}
                      style={getColumnSizeStyles(cell.column)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
      <PageFooterPortal>
        <Pagination table={table} entityName="Logs" totalItems={totalItems} />
      </PageFooterPortal>
    </div>
  )
}

function AuditLogTableSkeleton({ columns }: { columns: Column<AuditLog>[] }) {
  return (
    <>
      {Array.from({ length: DEFAULT_PAGE_SIZE }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {columns.map((column, columnIndex) => (
            <TableCell
              key={`${rowIndex}-${column.id}`}
              sticky={column.getIsPinned()}
              style={getColumnSizeStyles(column)}
            >
              {columnIndex === 0 || columnIndex === 3 || columnIndex === 4 ? (
                <div className="space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : (
                <Skeleton className="h-4 w-10/12" />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

const auditLogColumns: ColumnDef<AuditLog>[] = [
  {
    id: 'time',
    header: 'Time',
    size: 200,
    cell: ({ row }) => {
      const createdAt = new Date(row.original.createdAt)
      const localeString = createdAt.toLocaleString()
      const relativeTimeString = getRelativeTimeString(row.original.createdAt).relativeTimeString

      return (
        <TimestampTooltip timestamp={row.original.createdAt?.toString()}>
          <div className="space-y-1 cursor-default text-left">
            <div className="font-medium truncate">{relativeTimeString}</div>
            <div className="text-sm text-muted-foreground truncate">{localeString}</div>
          </div>
        </TimestampTooltip>
      )
    },
  },
  {
    id: 'user',
    header: 'User',
    size: 240,
    cell: ({ row }) => {
      const actorEmail = row.original.actorEmail
      const actorId = row.original.actorId
      const label = actorEmail || actorId
      const apiKeyPrefix = row.original.actorApiKeyPrefix
      const apiKeySuffix = row.original.actorApiKeySuffix
      const maskedApiKey =
        apiKeyPrefix && apiKeySuffix ? getMaskedTokenFromParts(apiKeyPrefix, apiKeySuffix) : undefined

      return (
        <div className="space-y-1">
          <EllipsisWithTooltip className="font-medium">{label}</EllipsisWithTooltip>
          {maskedApiKey && (
            <EllipsisWithTooltip className="text-sm text-muted-foreground">{maskedApiKey}</EllipsisWithTooltip>
          )}
        </div>
      )
    },
  },
  {
    id: 'action',
    header: 'Action',
    size: 240,
    cell: ({ row }) => {
      const action = row.original.action

      return <EllipsisWithTooltip className="font-medium">{action}</EllipsisWithTooltip>
    },
  },
  {
    id: 'target',
    header: 'Target',
    size: 360,
    cell: ({ row }) => {
      const targetType = row.original.targetType
      const targetId = row.original.targetId

      if (!targetType && !targetId) {
        return '-'
      }

      return (
        <div className="space-y-1">
          {targetType && <EllipsisWithTooltip className="font-medium">{targetType}</EllipsisWithTooltip>}
          {targetId && <EllipsisWithTooltip className="text-sm text-muted-foreground">{targetId}</EllipsisWithTooltip>}
        </div>
      )
    },
  },
  {
    id: 'outcome',
    header: 'Outcome',
    size: 320,
    cell: ({ row }) => {
      const statusCode = row.original.statusCode
      const errorMessage = row.original.errorMessage
      const outcomeInfo = getOutcomeInfo(statusCode)

      return (
        <div className="space-y-1">
          <div className={cn('font-medium', outcomeInfo.colorClass)}>{outcomeInfo.label}</div>
          {!errorMessage ? (
            <div className="text-sm text-muted-foreground truncate">{statusCode || '204'}</div>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="text-sm text-muted-foreground truncate">
                    {statusCode || '500'}
                    {` - ${errorMessage}`}
                  </div>
                }
              />
              <TooltipContent className="max-h-60 max-w-sm overflow-y-auto">
                <p className="whitespace-pre-wrap wrap-break-word">{errorMessage}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )
    },
  },
]
