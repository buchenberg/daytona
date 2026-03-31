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
import { Sandbox, SandboxState, BackupState } from '../../types'
import dayjs from 'dayjs'
import { cn } from '@backoffice/lib/utils'

interface TableViewProps {
  sandboxes: Sandbox[]
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
  onEdit?: (sandbox: Sandbox) => void
  activeFilterCount: number
  selectedRowKeys: string[]
  onSelectionChange: (selectedRowKeys: string[]) => void
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

const getStateColor = (state: SandboxState): string => {
  switch (state) {
    case SandboxState.STARTED:
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case SandboxState.STOPPED:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    case SandboxState.ERROR:
    case SandboxState.BUILD_FAILED:
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case SandboxState.STARTING:
    case SandboxState.STOPPING:
    case SandboxState.CREATING:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case SandboxState.ARCHIVED:
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

const getBackupStateColor = (state: string): string => {
  switch (state) {
    case BackupState.COMPLETED:
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case BackupState.PENDING:
    case BackupState.IN_PROGRESS:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case BackupState.ERROR:
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

export const TableView = ({
  sandboxes,
  loading,
  refreshing = false,
  pagination,
  onPaginationChange,
  onFilterClick,
  onRefresh,
  onEdit,
  activeFilterCount,
  selectedRowKeys,
  onSelectionChange,
  sortField,
  sortOrder,
  onSortChange,
  searchValue = '',
  onSearchChange,
}: TableViewProps) => {
  const isAdmin = useIsAdmin()
  const columns: Column<Sandbox>[] = [
    {
      key: 'name',
      title: 'Name/ID',
      width: '200px',
      sortable: true,
      render: (sandbox) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            <TruncatedText text={sandbox.name} maxLength={30} />
          </span>
          {sandbox.id !== sandbox.name && (
            <span className="text-xs text-muted-foreground font-mono">
              <TruncatedText text={sandbox.id} maxLength={36} />
            </span>
          )}
          {sandbox.errorReason && (
            <Badge className="text-xs w-fit bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              <TruncatedText text={sandbox.errorReason} maxLength={30} />
            </Badge>
          )}
          {sandbox.backupErrorReason && (
            <Badge className="text-xs w-fit bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
              <TruncatedText text={sandbox.backupErrorReason} maxLength={30} />
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'organization',
      title: 'Organization',
      width: '180px',
      render: (sandbox) => (
        <span className="text-xs text-muted-foreground font-mono">
          <TruncatedText text={sandbox.organizationId} maxLength={36} />
        </span>
      ),
    },
    {
      key: 'runnerId',
      title: 'Runner',
      width: '120px',
      render: (sandbox) => (
        <span className="text-xs text-muted-foreground font-mono">
          {sandbox.runnerId ? <TruncatedText text={sandbox.runnerId} maxLength={12} /> : '-'}
        </span>
      ),
    },
    {
      key: 'region',
      title: 'Region',
      width: '100px',
      sortable: true,
      render: (sandbox) => <span className="text-sm">{sandbox.region}</span>,
    },
    {
      key: 'state',
      title: 'State',
      width: '120px',
      sortable: true,
      render: (sandbox) => (
        <Badge className={cn('font-normal', getStateColor(sandbox.state))}>
          {sandbox.state.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'resources',
      title: 'Resources',
      width: '190px',
      render: (sandbox) => (
        <div className="flex items-center gap-2 w-full truncate">
          <div className="whitespace-nowrap">
            {sandbox.cpu} <span className="text-muted-foreground">vCPU</span>
          </div>
          <div className="w-[1px] h-6 bg-muted-foreground/20 rounded-full inline-block"></div>
          <div className="whitespace-nowrap">
            {sandbox.mem} <span className="text-muted-foreground">GiB</span>
          </div>
          <div className="w-[1px] h-6 bg-muted-foreground/20 rounded-full inline-block"></div>
          <div className="whitespace-nowrap">
            {sandbox.disk} <span className="text-muted-foreground">GiB</span>
          </div>
        </div>
      ),
    },
    {
      key: 'backupState',
      title: 'Backup',
      width: '110px',
      render: (sandbox) => (
        <Badge className={cn('font-normal', getBackupStateColor(sandbox.backupState))}>
          {sandbox.backupState.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      title: 'Created',
      width: '120px',
      sortable: true,
      render: (sandbox) => <span className="text-sm">{dayjs(sandbox.createdAt).format('YYYY-MM-DD')}</span>,
    },
  ]

  if (onEdit && isAdmin) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '100px',
      render: (sandbox) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(sandbox)
          }}
          disabled={sandbox.state === SandboxState.DESTROYED}
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
            placeholder="Search by ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[200px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={sandboxes}
        loading={loading}
        rowKey={(sandbox) => sandbox.id}
        selectedRows={new Set(selectedRowKeys)}
        onSelectionChange={(selectedIds) => onSelectionChange(Array.from(selectedIds))}
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
