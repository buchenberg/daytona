/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Filter, RefreshCw, Edit } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { Badge } from '@dashboard/ui/badge'
import { Input } from '@dashboard/ui/input'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { TruncatedText } from '@backoffice/components/TruncatedText'
import { useIsAdmin } from '../../providers/ApiProvider'
import { Runner, RunnerState } from '../../types'
import dayjs from 'dayjs'
import { cn } from '@backoffice/lib/utils'

interface TableViewProps {
  runners: Runner[]
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
  onEdit?: (runner: Runner) => void
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

const getStateColor = (state: RunnerState): string => {
  switch (state) {
    case RunnerState.READY:
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case RunnerState.DISABLED:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    case RunnerState.UNRESPONSIVE:
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case RunnerState.INITIALIZING:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case RunnerState.DECOMMISSIONED:
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

const getProgressColor = (value: number): string => {
  if (value < 50) return 'bg-green-500'
  if (value < 80) return 'bg-yellow-500'
  return 'bg-red-500'
}

const ProgressBar = ({ value }: { value: number }) => {
  const roundedValue = Math.round(value)
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={cn('h-full transition-all', getProgressColor(value))} style={{ width: `${roundedValue}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{roundedValue}%</span>
    </div>
  )
}

export const TableView = ({
  runners,
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
  const isAdmin = useIsAdmin()
  const columns: Column<Runner>[] = [
    {
      key: 'domain',
      title: 'Domain',
      width: '200px',
      render: (runner) => (
        <div className="flex flex-col">
          <span className="font-medium">
            <TruncatedText text={runner.domain} maxLength={30} />
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            <TruncatedText text={runner.id} maxLength={36} />
          </span>
        </div>
      ),
    },
    {
      key: 'region',
      title: 'Region',
      width: '100px',
      render: (runner) => <span className="text-sm">{runner.region}</span>,
    },
    {
      key: 'state',
      title: 'State',
      width: '130px',
      sortable: true,
      render: (runner) => (
        <Badge className={cn('font-normal', getStateColor(runner.state))}>{runner.state.toUpperCase()}</Badge>
      ),
    },
    {
      key: 'currentCpuUsagePercentage',
      title: 'CPU Usage',
      width: '150px',
      sortable: true,
      render: (runner) => <ProgressBar value={runner.currentCpuUsagePercentage} />,
    },
    {
      key: 'currentMemoryUsagePercentage',
      title: 'Memory Usage',
      width: '150px',
      sortable: true,
      render: (runner) => <ProgressBar value={runner.currentMemoryUsagePercentage} />,
    },
    {
      key: 'currentDiskUsagePercentage',
      title: 'Disk Usage',
      width: '150px',
      render: (runner) => <ProgressBar value={runner.currentDiskUsagePercentage} />,
    },
    {
      key: 'availabilityScore',
      title: 'Availability',
      width: '120px',
      sortable: true,
      render: (runner) => <span className="text-sm text-right">{runner.availabilityScore?.toFixed(2) ?? 'N/A'}</span>,
    },
    {
      key: 'resources',
      title: 'Resources',
      width: '190px',
      render: (runner) => (
        <div className="flex items-center gap-2 w-full truncate">
          <div className="whitespace-nowrap">
            {runner.cpu} <span className="text-muted-foreground">vCPU</span>
          </div>
          <div className="w-[1px] h-6 bg-muted-foreground/20 rounded-full inline-block"></div>
          <div className="whitespace-nowrap">
            {runner.memoryGiB} <span className="text-muted-foreground">GiB</span>
          </div>
          <div className="w-[1px] h-6 bg-muted-foreground/20 rounded-full inline-block"></div>
          <div className="whitespace-nowrap">
            {runner.diskGiB} <span className="text-muted-foreground">GiB</span>
          </div>
        </div>
      ),
    },
    {
      key: 'lastChecked',
      title: 'Last Checked',
      width: '140px',
      sortable: true,
      render: (runner) => (
        <span className="text-sm">
          {runner.lastChecked ? dayjs(runner.lastChecked).format('YYYY-MM-DD HH:mm') : '-'}
        </span>
      ),
    },
    {
      key: 'unschedulable',
      title: 'Unschedulable',
      width: '120px',
      render: (runner) => (
        <Badge
          className={
            runner.unschedulable
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }
        >
          {runner.unschedulable ? 'Yes' : 'No'}
        </Badge>
      ),
    },
  ]

  if (onEdit && isAdmin) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '100px',
      render: (runner) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(runner)
          }}
          disabled={runner.state === RunnerState.DECOMMISSIONED}
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
            placeholder="Search by domain or ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[200px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={runners}
        loading={loading}
        rowKey={(runner) => runner.id}
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
