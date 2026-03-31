/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dashboard/ui/table'
import { Checkbox } from '@dashboard/ui/checkbox'
import { Button } from '@dashboard/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Spinner } from '@dashboard/ui/spinner'
import { SortOrderIcon } from '@dashboard/components/SortIcon'

export interface Column<T> {
  key: string
  title: string
  render?: (item: T) => ReactNode
  width?: string
  sortable?: boolean
}

export interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  pageSizeOptions?: number[]
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  rowKey: (item: T) => string
  selectedRows?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  pagination?: PaginationInfo
  onPaginationChange?: (page: number, pageSize: number) => void
  onRowClick?: (item: T) => void
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  rowKey,
  selectedRows = new Set(),
  onSelectionChange,
  pagination,
  onPaginationChange,
  onRowClick,
  sortField,
  sortOrder,
  onSortChange,
}: DataTableProps<T>) {
  const handleSortClick = (columnKey: string) => {
    if (!onSortChange) return
    if (sortField !== columnKey) {
      onSortChange(columnKey, 'desc')
    } else if (sortOrder === 'desc') {
      onSortChange(columnKey, 'asc')
    } else {
      onSortChange(columnKey, 'desc')
    }
  }
  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return

    if (checked) {
      const allIds = new Set(data.map((item) => rowKey(item)))
      onSelectionChange(allIds)
    } else {
      onSelectionChange(new Set())
    }
  }

  const handleSelectRow = (id: string, checked: boolean) => {
    if (!onSelectionChange) return

    const newSelection = new Set(selectedRows)
    if (checked) {
      newSelection.add(id)
    } else {
      newSelection.delete(id)
    }
    onSelectionChange(newSelection)
  }

  const allSelected = data.length > 0 && data.every((item) => selectedRows.has(rowKey(item)))
  const someSelected = data.some((item) => selectedRows.has(rowKey(item))) && !allSelected

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {onSelectionChange && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                    className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead key={column.key} style={{ width: column.width }}>
                  {column.sortable && onSortChange ? (
                    <button
                      className="group/sort-header flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSortClick(column.key)}
                    >
                      {column.title}
                      <SortOrderIcon sort={sortField === column.key ? (sortOrder ?? null) : null} className="h-3 w-3" />
                    </button>
                  ) : (
                    column.title
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (onSelectionChange ? 1 : 0)} className="h-24 text-center">
                  No results found
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => {
                const id = rowKey(item)
                const isSelected = selectedRows.has(id)

                return (
                  <TableRow
                    key={id}
                    className={onRowClick ? 'cursor-pointer' : ''}
                    onClick={() => onRowClick?.(item)}
                    data-state={isSelected ? 'selected' : ''}
                  >
                    {onSelectionChange && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectRow(id, checked as boolean)}
                          aria-label={`Select row ${id}`}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {column.render ? column.render(item) : String((item as any)[column.key] ?? '-')}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && onPaginationChange && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} results
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(value) => {
                  const newPageSize = Number(value)
                  onPaginationChange(1, newPageSize) // Reset to page 1 when changing page size
                }}
              >
                <SelectTrigger className="h-8 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(pagination.pageSizeOptions || [10, 15, 20]).map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPaginationChange(pagination.page - 1, pagination.pageSize)}
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-sm">
                Page {pagination.page} of {Math.ceil(pagination.total / pagination.pageSize)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPaginationChange(pagination.page + 1, pagination.pageSize)}
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
