/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Filter, RefreshCw, Edit, Share2, Database } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { Badge } from '@dashboard/ui/badge'
import { Input } from '@dashboard/ui/input'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { TruncatedText } from '@backoffice/components/TruncatedText'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@dashboard/ui/tooltip'
import { useIsAdmin } from '../../providers/ApiProvider'
import { Snapshot, SnapshotState } from '../../types'
import dayjs from 'dayjs'
import { cn } from '@backoffice/lib/utils'

interface TableViewProps {
  snapshots: Snapshot[]
  loading: boolean
  refreshing?: boolean
  pagination: {
    current: number
    pageSize: number
    total: number
  }
  onPaginationChange: (page: number, pageSize: number) => void
  onFilterClick: () => void
  onRefresh: () => void
  activeFilterCount: number
  selectedRowKeys?: string[]
  onSelectionChange?: (selectedRowKeys: string[]) => void
  onEdit?: (snapshot: Snapshot) => void
  onPropagate?: (snapshot: Snapshot) => void
  onAddToWarmPool?: (snapshot: Snapshot) => void
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

const getStateColor = (state: SnapshotState): string => {
  switch (state) {
    case SnapshotState.ACTIVE:
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case SnapshotState.BUILDING:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case SnapshotState.PENDING:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    case SnapshotState.ERROR:
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case SnapshotState.REMOVING:
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

export const TableView = ({
  snapshots,
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
  onPropagate,
  onAddToWarmPool,
  sortField,
  sortOrder,
  onSortChange,
  searchValue = '',
  onSearchChange,
}: TableViewProps) => {
  const isAdmin = useIsAdmin()
  const columns: Column<Snapshot>[] = [
    {
      key: 'name',
      title: 'Name',
      width: '200px',
      sortable: true,
      render: (snapshot) => (
        <div className="flex flex-col">
          <span className="font-medium">{snapshot.name}</span>
          {snapshot.errorReason && <span className="text-xs text-destructive">{snapshot.errorReason}</span>}
        </div>
      ),
    },
    {
      key: 'imageName',
      title: 'Image',
      width: '200px',
      render: (snapshot) => (
        <span className="text-sm">
          <TruncatedText text={snapshot.imageName} maxLength={35} />
        </span>
      ),
    },
    {
      key: 'state',
      title: 'State',
      width: '120px',
      sortable: true,
      render: (snapshot) => (
        <Badge className={cn('font-normal', getStateColor(snapshot.state))}>{snapshot.state.toUpperCase()}</Badge>
      ),
    },
    {
      key: 'type',
      title: 'Type',
      width: '100px',
      render: (snapshot) => (
        <div className="flex gap-1">
          {snapshot.general && (
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">General</Badge>
          )}
          {snapshot.hideFromUsers && <Badge variant="outline">Hidden</Badge>}
        </div>
      ),
    },
    {
      key: 'size',
      title: 'Size (GB)',
      width: '110px',
      sortable: true,
      render: (snapshot) => (
        <span className="text-sm text-right">{snapshot.size ? snapshot.size.toFixed(2) : '-'}</span>
      ),
    },
    {
      key: 'resources',
      title: 'Resources',
      width: '190px',
      render: (snapshot) => (
        <div className="flex items-center gap-2 w-full truncate">
          <div className="whitespace-nowrap">
            {snapshot.cpu} <span className="text-muted-foreground">vCPU</span>
          </div>
          <div className="w-[1px] h-6 bg-muted-foreground/20 rounded-full inline-block"></div>
          <div className="whitespace-nowrap">
            {snapshot.mem} <span className="text-muted-foreground">GiB</span>
          </div>
          <div className="w-[1px] h-6 bg-muted-foreground/20 rounded-full inline-block"></div>
          <div className="whitespace-nowrap">
            {snapshot.disk} <span className="text-muted-foreground">GiB</span>
          </div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      title: 'Created',
      width: '120px',
      sortable: true,
      render: (snapshot) => <span className="text-sm">{dayjs(snapshot.createdAt).format('YYYY-MM-DD')}</span>,
    },
    {
      key: 'lastUsedAt',
      title: 'Last Used',
      width: '140px',
      sortable: true,
      render: (snapshot) => (
        <span className="text-sm">
          {snapshot.lastUsedAt ? dayjs(snapshot.lastUsedAt).format('YYYY-MM-DD HH:mm') : '-'}
        </span>
      ),
    },
  ]

  // Add actions column if onEdit or onPropagate or onAddToWarmPool callbacks are provided
  if ((onEdit && isAdmin) || onPropagate || onAddToWarmPool) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '100px',
      render: (snapshot) => (
        <TooltipProvider delayDuration={300}>
          <div className="flex gap-1">
            {onEdit && isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(snapshot)
                    }}
                    disabled={snapshot.state === SnapshotState.REMOVING}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit snapshot</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onPropagate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPropagate(snapshot)
                    }}
                    disabled={snapshot.state === SnapshotState.REMOVING || snapshot.state === SnapshotState.PENDING}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Propagate to runners</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onAddToWarmPool && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAddToWarmPool(snapshot)
                    }}
                    disabled={snapshot.state === SnapshotState.REMOVING || snapshot.state === SnapshotState.PENDING}
                  >
                    <Database className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add to warm pool</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
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
            placeholder="Search by name..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[200px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={snapshots}
        loading={loading}
        rowKey={(snapshot) => snapshot.id}
        selectedRows={onSelectionChange ? new Set(selectedRowKeys) : undefined}
        onSelectionChange={onSelectionChange ? (selectedIds) => onSelectionChange(Array.from(selectedIds)) : undefined}
        pagination={{
          page: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
        }}
        onPaginationChange={onPaginationChange}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
      />
    </div>
  )
}
