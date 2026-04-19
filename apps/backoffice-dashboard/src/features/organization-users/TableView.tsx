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
import { useHasPermission } from '../../providers/ApiProvider'
import { OrganizationUser, OrganizationMemberRole } from '../../types'
import dayjs from 'dayjs'
import { cn } from '@backoffice/lib/utils'

interface TableViewProps {
  organizationUsers: OrganizationUser[]
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
  onEdit?: (organizationUser: OrganizationUser) => void
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

const getRoleColor = (role: OrganizationMemberRole | string): string => {
  switch (role) {
    case OrganizationMemberRole.OWNER:
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'admin':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    case OrganizationMemberRole.MEMBER:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

export const TableView = ({
  organizationUsers,
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
  const canWrite = useHasPermission('organizationUsers', 'write')
  const columns: Column<OrganizationUser>[] = [
    {
      key: 'userId',
      title: 'User ID',
      width: '200px',
      render: (record) => (
        <div className="flex flex-col">
          <span className="font-mono font-medium">
            <TruncatedText text={record.userId} maxLength={25} />
          </span>
          {(record as any).userEmail && (
            <span className="text-xs text-muted-foreground">{(record as any).userEmail}</span>
          )}
        </div>
      ),
    },
    {
      key: 'organization',
      title: 'Organization',
      width: '250px',
      render: (record) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">
            <TruncatedText text={record.organizationId} maxLength={30} />
          </span>
        </div>
      ),
    },
    {
      key: 'role',
      title: 'Role',
      width: '120px',
      sortable: true,
      render: (record) => (
        <Badge className={cn('font-normal', getRoleColor(record.role))}>{record.role.toUpperCase()}</Badge>
      ),
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
      render: (organizationUser) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(organizationUser)
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
            placeholder="Search by user ID or org ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[200px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={organizationUsers}
        loading={loading}
        rowKey={(record) => `${record.organizationId}:${record.userId}`}
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
