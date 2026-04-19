/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Filter, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { Badge } from '@dashboard/ui/badge'
import { Input } from '@dashboard/ui/input'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { TruncatedText } from '@backoffice/components/TruncatedText'
import { useHasPermission } from '../../providers/ApiProvider'
import type { User } from '../../types'
import dayjs from 'dayjs'
import { cn } from '@backoffice/lib/utils'

interface TableViewProps {
  users: User[]
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
  onDelete?: (user: User) => void
  activeFilterCount: number
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

export const TableView = ({
  users,
  loading,
  refreshing = false,
  pagination,
  onPaginationChange,
  onFilterClick,
  onRefresh,
  onDelete,
  activeFilterCount,
  sortField,
  sortOrder,
  onSortChange,
  searchValue = '',
  onSearchChange,
}: TableViewProps) => {
  const canDelete = useHasPermission('users', 'delete')

  const columns: Column<User>[] = [
    {
      key: 'email',
      title: 'Email',
      width: '260px',
      sortable: true,
      render: (user) => (
        <div className="flex flex-col">
          <span className={cn('font-medium', user.email === 'DELETED' && 'text-muted-foreground')}>
            {user.email || '(empty)'}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            <TruncatedText text={user.id} maxLength={36} />
          </span>
        </div>
      ),
    },
    {
      key: 'name',
      title: 'Name',
      width: '200px',
      sortable: true,
      render: (user) => <span className="text-sm">{user.name || '(empty)'}</span>,
    },
    {
      key: 'emailVerified',
      title: 'Verified',
      width: '100px',
      render: (user) => (
        <Badge variant={user.emailVerified ? 'default' : 'secondary'}>{user.emailVerified ? 'Yes' : 'No'}</Badge>
      ),
    },
    {
      key: 'createdAt',
      title: 'Created',
      width: '140px',
      sortable: true,
      render: (user) => <span className="text-sm">{dayjs(user.createdAt).format('YYYY-MM-DD HH:mm')}</span>,
    },
  ]

  if (onDelete && canDelete) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '100px',
      render: (user) => {
        const isDeleted = user.email === 'DELETED' || user.id.startsWith('DELETED_')
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(user)
            }}
            disabled={isDeleted}
            title={isDeleted ? 'User already deleted' : 'Delete user'}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
        )
      },
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
            placeholder="Search by email or ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[240px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        rowKey={(user) => user.id}
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
