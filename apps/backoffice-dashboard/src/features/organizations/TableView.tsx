/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Filter, RefreshCw, Edit, Webhook } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { Badge } from '@dashboard/ui/badge'
import { Input } from '@dashboard/ui/input'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { TruncatedText } from '@backoffice/components/TruncatedText'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@dashboard/ui/tooltip'
import { useIsAdmin } from '../../providers/ApiProvider'
import { Organization } from '../../types'
import dayjs from 'dayjs'
import { cn } from '@backoffice/lib/utils'

interface TableViewProps {
  organizations: Organization[]
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
  onEdit?: (organization: Organization) => void
  onInitializeWebhooks?: (organization: Organization) => void
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

export const TableView = ({
  organizations,
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
  onInitializeWebhooks,
  sortField,
  sortOrder,
  onSortChange,
  searchValue = '',
  onSearchChange,
}: TableViewProps) => {
  const isAdmin = useIsAdmin()
  const columns: Column<Organization>[] = [
    {
      key: 'name',
      title: 'Name',
      width: '200px',
      sortable: true,
      render: (org) => (
        <div className="flex flex-col">
          <span className="font-medium">
            <TruncatedText text={org.name} maxLength={30} />
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            <TruncatedText text={org.id} maxLength={12} />
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      title: 'Type',
      width: '100px',
      render: (org) => (
        <div className="flex gap-1">
          {org.personal && (
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Personal</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'suspended',
      title: 'Suspended',
      width: '100px',
      render: (org) => (
        <Badge
          className={
            org.suspended
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }
        >
          {org.suspended ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'suspendedAt',
      title: 'Suspended At',
      width: '140px',
      sortable: true,
      render: (org) => (
        <span className="text-sm">{org.suspendedAt ? dayjs(org.suspendedAt).format('YYYY-MM-DD HH:mm') : '-'}</span>
      ),
    },
    {
      key: 'createdBy',
      title: 'Created By',
      width: '150px',
      render: (org) => (
        <span className="text-sm">
          <TruncatedText text={org.createdBy} maxLength={20} />
        </span>
      ),
    },
    {
      key: 'createdAt',
      title: 'Created',
      width: '120px',
      sortable: true,
      render: (org) => <span className="text-sm">{dayjs(org.createdAt).format('YYYY-MM-DD')}</span>,
    },
  ]

  // Add actions column if any action callback is provided
  if ((onEdit && isAdmin) || onInitializeWebhooks) {
    columns.push({
      key: 'actions',
      title: 'Actions',
      width: '150px',
      render: (organization) => (
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
                      onEdit(organization)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit organization</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onInitializeWebhooks && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onInitializeWebhooks(organization)
                    }}
                  >
                    <Webhook className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Initialize webhooks</p>
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
            placeholder="Search by name or ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[200px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={organizations}
        loading={loading}
        rowKey={(org) => org.id}
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
