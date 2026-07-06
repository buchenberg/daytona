/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DEFAULT_SECRET_SORTING, SecretSorting } from '@/hooks/queries/useSecretsQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { cn, getRelativeTimeString } from '@/lib/utils'
import { DEFAULT_TABLE_COLUMN, getColumnSizeStyles, getTableSizeStyles } from '@/lib/utils/table'
import {
  ListSecretsPaginatedOrderEnum,
  ListSecretsPaginatedSortEnum,
  OrganizationRolePermissionsEnum,
  Secret,
} from '@daytona/api-client'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  Table as ReactTable,
  RowData,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { MoreHorizontal, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { CursorPagination } from './CursorPagination'
import { PageFooterPortal } from './PageLayout'
import { SearchInput } from './SearchInput'
import { TimestampTooltip } from './TimestampTooltip'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Skeleton } from './ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

type SecretTableMeta = {
  onEdit: (secret: Secret) => void
  onDelete: (secret: Secret) => void
  managePermitted: boolean
}

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    secret?: TData extends Secret ? SecretTableMeta : never
  }
}

const getMeta = (table: ReactTable<Secret>) => {
  return table.options.meta?.secret as SecretTableMeta
}

const convertApiSortingToTableSorting = (sorting: SecretSorting): SortingState => {
  let id: string
  switch (sorting.field) {
    case ListSecretsPaginatedSortEnum.NAME:
      id = 'name'
      break
    case ListSecretsPaginatedSortEnum.UPDATED_AT:
      id = 'updatedAt'
      break
    case ListSecretsPaginatedSortEnum.CREATED_AT:
    default:
      id = 'createdAt'
      break
  }

  return [{ id, desc: sorting.direction === ListSecretsPaginatedOrderEnum.DESC }]
}

const convertTableSortingToApiSorting = (sorting: SortingState): SecretSorting => {
  if (!sorting.length) {
    return DEFAULT_SECRET_SORTING
  }

  const sort = sorting[0]
  let field: ListSecretsPaginatedSortEnum

  switch (sort.id) {
    case 'name':
      field = ListSecretsPaginatedSortEnum.NAME
      break
    case 'updatedAt':
      field = ListSecretsPaginatedSortEnum.UPDATED_AT
      break
    case 'createdAt':
    default:
      field = ListSecretsPaginatedSortEnum.CREATED_AT
      break
  }

  return {
    field,
    direction: sort.desc ? ListSecretsPaginatedOrderEnum.DESC : ListSecretsPaginatedOrderEnum.ASC,
  }
}

interface SecretTableProps {
  data: Secret[]
  loading: boolean
  onEdit: (secret: Secret) => void
  onDelete: (secret: Secret) => void
  pageSize: number
  onPageSizeChange: (pageSize: number) => void
  hasNextPage: boolean
  hasPreviousPage: boolean
  onNextPage: () => void
  onPreviousPage: () => void
  searchValue: string
  onSearchChange: (value: string) => void
  sorting: SecretSorting
  onSortingChange: (sorting: SecretSorting) => void
}

export function SecretTable({
  data,
  loading,
  onEdit,
  onDelete,
  pageSize,
  onPageSizeChange,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  searchValue,
  onSearchChange,
  sorting,
  onSortingChange,
}: SecretTableProps) {
  const { authenticatedUserHasPermission } = useSelectedOrganization()

  const managePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.MANAGE_SECRETS),
    [authenticatedUserHasPermission],
  )

  const tableSorting = useMemo(() => convertApiSortingToTableSorting(sorting), [sorting])

  const table = useReactTable({
    columnResizeMode: 'onEnd',
    data,
    columns,
    meta: {
      secret: { onEdit, onDelete, managePermitted },
    },
    defaultColumn: DEFAULT_TABLE_COLUMN,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    onSortingChange: (updater) => {
      const newTableSorting = typeof updater === 'function' ? updater(table.getState().sorting) : updater
      onSortingChange(convertTableSortingToApiSorting(newTableSorting))
    },
    state: {
      sorting: tableSorting,
    },
    initialState: {
      columnPinning: {
        left: ['name'],
        right: ['actions'],
      },
    },
  })

  const isEmpty = !loading && table.getRowModel().rows.length === 0
  const hasSearch = searchValue.trim().length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <SearchInput
          debounced
          value={searchValue}
          onValueChange={onSearchChange}
          placeholder="Search by Name"
          containerClassName="min-w-0 flex-1 sm:max-w-sm"
        />
      </div>
      <TableContainer
        className={cn({
          'min-h-[26rem]': isEmpty,
        })}
        empty={
          isEmpty ? (
            <TableEmptyState
              overlay
              colSpan={columns.length}
              message={hasSearch ? 'No matching secrets found.' : 'No Secrets yet.'}
              icon={<ShieldCheck />}
              description={
                hasSearch ? null : (
                  <div className="space-y-2">
                    <p>Secrets store sensitive values that can be injected into sandboxes at runtime.</p>
                    <p>Create one to get started.</p>
                  </div>
                )
              }
              action={
                hasSearch ? (
                  <Button variant="outline" onClick={() => onSearchChange('')}>
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
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    header={header}
                    sticky={header.column.getIsPinned()}
                    style={getColumnSizeStyles(header.column)}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <>
                {Array.from({ length: pageSize }).map((_, i) => (
                  <TableRow key={i}>
                    {table.getVisibleLeafColumns().map((column) => (
                      <TableCell key={column.id} sticky={column.getIsPinned()} style={getColumnSizeStyles(column)}>
                        <Skeleton className="h-4 w-10/12" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
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
        <CursorPagination
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
        />
      </PageFooterPortal>
    </div>
  )
}

const columns: ColumnDef<Secret>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    size: 200,
  },
  {
    accessorKey: 'description',
    header: 'Description',
    size: 250,
    enableSorting: false,
    cell: ({ row }) => {
      const description = row.original.description
      return description ? (
        <span className="truncate">{description}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  },
  {
    accessorKey: 'hosts',
    header: 'Allowed Hosts',
    size: 220,
    enableSorting: false,
    cell: ({ row }) => {
      const hosts = row.original.hosts
      return hosts?.length ? (
        <span className="truncate">{hosts.join(', ')}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    size: 140,
    cell: ({ row }) => {
      const createdAt = row.original.createdAt
      return (
        <TimestampTooltip timestamp={createdAt?.toString()}>
          <span className="cursor-default">{getRelativeTimeString(createdAt).relativeTimeString}</span>
        </TimestampTooltip>
      )
    },
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    size: 140,
    cell: ({ row }) => {
      const updatedAt = row.original.updatedAt
      return (
        <TimestampTooltip timestamp={updatedAt?.toString()}>
          <span className="cursor-default">{getRelativeTimeString(updatedAt).relativeTimeString}</span>
        </TimestampTooltip>
      )
    },
  },
  {
    id: 'actions',
    header: () => null,
    size: 48,
    minSize: 48,
    maxSize: 48,
    enableSorting: false,
    cell: ({ row, table }) => {
      const { onEdit, onDelete, managePermitted } = getMeta(table)

      if (!managePermitted) {
        return null
      }

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open menu">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(row.original)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  },
]
