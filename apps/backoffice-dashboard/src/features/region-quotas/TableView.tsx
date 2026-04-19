/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Filter, RefreshCw, Edit } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { TruncatedText } from '@backoffice/components/TruncatedText'
import { useHasPermission } from '../../providers/ApiProvider'
import { RegionQuota } from '../../types'
import dayjs from 'dayjs'
import { cn } from '@backoffice/lib/utils'

interface TableViewProps {
  regionQuotas: RegionQuota[]
  loading: boolean
  refreshing?: boolean
  pagination: {
    page: number
    pageSize: number
    total: number
  }
  onPaginationChange: (page: number, pageSize: number) => void
  onFilterClick: () => void
  onRefresh: () => void
  activeFilterCount: number
  selectedRowKeys?: string[]
  onSelectionChange?: (selectedRowKeys: string[]) => void
  onEdit?: (regionQuota: RegionQuota) => void
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

export const TableView = ({
  regionQuotas,
  loading,
  refreshing = false,
  pagination,
  onPaginationChange,
  onFilterClick,
  onRefresh,
  activeFilterCount,
  selectedRowKeys = [],
  onSelectionChange,
  onEdit,
  sortField,
  sortOrder,
  onSortChange,
  searchValue = '',
  onSearchChange,
}: TableViewProps) => {
  const canWrite = useHasPermission('regionQuotas', 'write')
  const columns: Column<RegionQuota>[] = [
    {
      key: 'organization',
      title: 'Organization',
      width: '250px',
      render: (record) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{record.organizationName || '-'}</span>
          <span className="font-mono text-xs text-muted-foreground">
            <TruncatedText text={record.organizationId} maxLength={30} />
          </span>
        </div>
      ),
    },
    {
      key: 'regionId',
      title: 'Region',
      width: '150px',
      render: (record) => <span className="font-mono font-medium">{record.regionId}</span>,
    },
    {
      key: 'totalCpuQuota',
      title: 'CPU Quota',
      width: '120px',
      sortable: true,
      render: (record) => <span className="font-semibold">{record.totalCpuQuota}</span>,
    },
    {
      key: 'totalMemoryQuota',
      title: 'Memory (GB)',
      width: '120px',
      sortable: true,
      render: (record) => <span className="font-semibold">{record.totalMemoryQuota}</span>,
    },
    {
      key: 'totalDiskQuota',
      title: 'Disk (GB)',
      width: '120px',
      sortable: true,
      render: (record) => <span className="font-semibold">{record.totalDiskQuota}</span>,
    },
    {
      key: 'perSandboxCaps',
      title: 'Per-Sandbox Caps',
      width: '220px',
      render: (record) => {
        const fmt = (v: number | null | undefined) => (v == null ? '—' : String(v))
        return (
          <div className="flex flex-col text-xs leading-tight">
            <span>
              <span className="text-muted-foreground">cpu</span> {fmt(record.maxCpuPerSandbox)}{' '}
              <span className="text-muted-foreground">· mem</span> {fmt(record.maxMemoryPerSandbox)}
            </span>
            <span>
              <span className="text-muted-foreground">disk</span> {fmt(record.maxDiskPerSandbox)}{' '}
              <span className="text-muted-foreground">· non-eph</span> {fmt(record.maxDiskPerNonEphemeralSandbox)}
            </span>
          </div>
        )
      },
    },
    {
      key: 'createdAt',
      title: 'Created',
      width: '120px',
      sortable: true,
      render: (record) => <span className="text-sm">{dayjs(record.createdAt).format('YYYY-MM-DD')}</span>,
    },
    {
      key: 'updatedAt',
      title: 'Updated',
      width: '140px',
      sortable: true,
      render: (record) => <span className="text-sm">{dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm')}</span>,
    },
  ]

  // Add Edit button column if onEdit callback is provided
  if (onEdit && canWrite) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '100px',
      render: (regionQuota) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(regionQuota)
          }}
        >
          <Edit className="mr-1 h-3 w-3" />
          Edit
        </Button>
      ),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onFilterClick}>
          <Filter className="mr-2 h-4 w-4" />
          Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </Button>
        <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
        {onSearchChange && (
          <Input
            placeholder="Search by org name or ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[200px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={regionQuotas}
        loading={loading}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
        }}
        onPaginationChange={onPaginationChange}
        rowKey={(record) => `${record.organizationId}:${record.regionId}`}
        selectedRows={onSelectionChange ? new Set(selectedRowKeys) : undefined}
        onSelectionChange={onSelectionChange ? (keys) => onSelectionChange(Array.from(keys)) : undefined}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
      />
    </div>
  )
}
