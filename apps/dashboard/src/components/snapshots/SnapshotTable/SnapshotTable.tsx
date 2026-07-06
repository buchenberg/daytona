/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useCommandPaletteActions } from '@/components/CommandPalette'
import { PageFooterPortal } from '@/components/PageLayout'
import { ResponsiveButton } from '@/components/ResponsiveButton'
import { SearchInput } from '@/components/SearchInput'
import { SelectionToast, SelectionToastContainer } from '@/components/SelectionToast'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandCheckboxItem,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandInputButton,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FacetedFilter, type FacetedFilterOption } from '@/components/ui/faceted-filter'
import { Skeleton } from '@/components/ui/skeleton'
import { DEFAULT_PAGE_SIZE } from '@/constants/Pagination'
import { SnapshotSorting } from '@/hooks/queries/useSnapshotsQuery'
import { useCommandPaletteAnalytics } from '@/hooks/useCommandPaletteAnalytics'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { cn } from '@/lib/utils'
import { DEFAULT_TABLE_COLUMN, getColumnSizeStyles, getTableSizeStyles } from '@/lib/utils/table'
import { OrganizationRolePermissionsEnum, SnapshotDto, SnapshotState } from '@daytona/api-client'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Box, Globe, ListFilter, Square } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Pagination } from '../../Pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table'
import { SnapshotBulkAction, SnapshotBulkActionAlertDialog } from './BulkActionAlertDialog'
import { columns } from './columns'
import {
  getSnapshotBulkActionCounts,
  isSnapshotActivatable,
  isSnapshotDeactivatable,
  isSnapshotDeletable,
  useSnapshotsCommands,
} from './useSnapshotsCommands'
import { convertApiSortingToTableSorting, convertTableSortingToApiSorting } from './utils'

type SnapshotFacetFilterId = 'state' | 'region'

type SnapshotFacetFilter = {
  id: SnapshotFacetFilterId
  active: boolean
  filter: ReactNode
}

interface DataTableProps {
  data: SnapshotDto[]
  loading: boolean
  loadingSnapshots: Record<string, boolean>
  getRegionName: (regionId: string) => string | undefined
  onDelete: (snapshot: SnapshotDto) => void
  onBulkDelete?: (snapshots: SnapshotDto[]) => void
  onBulkDeactivate?: (snapshots: SnapshotDto[]) => void
  onBulkActivate?: (snapshots: SnapshotDto[]) => void
  onActivate?: (snapshot: SnapshotDto) => void
  onDeactivate?: (snapshot: SnapshotDto) => void
  onCreateSnapshot?: () => void
  onRowClick?: (snapshot: SnapshotDto, orderedSnapshots: SnapshotDto[]) => void
  activeSnapshotId?: string
  pagination: {
    pageIndex: number
    pageSize: number
  }
  pageCount: number
  totalItems: number
  onPaginationChange: (pagination: { pageIndex: number; pageSize: number }) => void
  searchValue: string
  onSearchChange: (value: string) => void
  sorting: SnapshotSorting
  onSortingChange: (sorting: SnapshotSorting) => void
  stateFilter: Set<string>
  onStateFilterChange: (values: Set<string>) => void
  regionFilter: Set<string>
  onRegionFilterChange: (values: Set<string>) => void
  regionOptions: FacetedFilterOption[]
}

function SnapshotStateFilterLabel({ colorClassName, label }: { colorClassName: string; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={cn('size-2 shrink-0 rounded-full', colorClassName)} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  )
}

const SNAPSHOT_STATE_OPTIONS: FacetedFilterOption[] = [
  {
    label: <SnapshotStateFilterLabel colorClassName="bg-success-foreground" label="Active" />,
    value: SnapshotState.ACTIVE,
  },
  {
    label: <SnapshotStateFilterLabel colorClassName="bg-muted-foreground" label="Inactive" />,
    value: SnapshotState.INACTIVE,
  },
  {
    label: <SnapshotStateFilterLabel colorClassName="bg-muted-foreground" label="Building" />,
    value: SnapshotState.BUILDING,
  },
  {
    label: <SnapshotStateFilterLabel colorClassName="bg-muted-foreground" label="Pending" />,
    value: SnapshotState.PENDING,
  },
  {
    label: <SnapshotStateFilterLabel colorClassName="bg-muted-foreground" label="Pulling" />,
    value: SnapshotState.PULLING,
  },
  {
    label: <SnapshotStateFilterLabel colorClassName="bg-destructive" label="Error" />,
    value: SnapshotState.ERROR,
  },
  {
    label: <SnapshotStateFilterLabel colorClassName="bg-destructive" label="Build Failed" />,
    value: SnapshotState.BUILD_FAILED,
  },
]

interface SnapshotStateFilterProps {
  value: Set<string>
  onFilterChange: (values: Set<string>) => void
}

function SnapshotStateFilter({ value, onFilterChange }: SnapshotStateFilterProps) {
  const values = Array.from(value)

  const handleFilterChange = (nextValues: string[]) => {
    onFilterChange(new Set(nextValues))
  }

  return (
    <Command>
      <CommandInput placeholder="State">
        <CommandInputButton
          className="text-sm text-muted-foreground hover:text-primary px-2"
          onClick={() => onFilterChange(new Set())}
        >
          Clear
        </CommandInputButton>
      </CommandInput>

      <CommandList>
        <CommandGroup>
          {SNAPSHOT_STATE_OPTIONS.map((option) => (
            <CommandCheckboxItem
              key={option.value}
              checked={value.has(option.value)}
              onSelect={() => {
                const nextValues = value.has(option.value)
                  ? values.filter((selectedValue) => selectedValue !== option.value)
                  : [...values, option.value]

                handleFilterChange(nextValues)
              }}
            >
              {option.label}
            </CommandCheckboxItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

interface SnapshotRegionFilterProps {
  value: Set<string>
  options: FacetedFilterOption[]
  onFilterChange: (values: Set<string>) => void
}

function SnapshotRegionFilter({ value, options, onFilterChange }: SnapshotRegionFilterProps) {
  const values = Array.from(value)

  const handleFilterChange = (nextValues: string[]) => {
    onFilterChange(new Set(nextValues))
  }

  return (
    <Command>
      <CommandInput placeholder="Region">
        <CommandInputButton
          className="text-sm text-muted-foreground hover:text-primary px-2"
          onClick={() => onFilterChange(new Set())}
        >
          Clear
        </CommandInputButton>
      </CommandInput>

      <CommandList>
        <CommandEmpty>No regions found.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandCheckboxItem
              key={option.value}
              checked={value.has(option.value)}
              onSelect={() => {
                const nextValues = value.has(option.value)
                  ? values.filter((selectedValue) => selectedValue !== option.value)
                  : [...values, option.value]

                handleFilterChange(nextValues)
              }}
            >
              {option.label}
            </CommandCheckboxItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export function SnapshotTable({
  data,
  loading,
  loadingSnapshots,
  getRegionName,
  onDelete,
  onActivate,
  onDeactivate,
  onCreateSnapshot,
  onRowClick,
  activeSnapshotId,
  pagination,
  pageCount,
  totalItems,
  onBulkDelete,
  onBulkActivate,
  onBulkDeactivate,
  onPaginationChange,
  searchValue,
  onSearchChange,
  sorting,
  onSortingChange,
  stateFilter,
  onStateFilterChange,
  regionFilter,
  onRegionFilterChange,
  regionOptions,
}: DataTableProps) {
  const { authenticatedUserHasPermission } = useSelectedOrganization()
  const [facetFilterOrder, setFacetFilterOrder] = useState<SnapshotFacetFilterId[]>([])

  const writePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_SNAPSHOTS),
    [authenticatedUserHasPermission],
  )

  const deletePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_SNAPSHOTS),
    [authenticatedUserHasPermission],
  )

  const tableSorting = useMemo(() => convertApiSortingToTableSorting(sorting), [sorting])

  const selectableCount = useMemo(() => {
    return data.filter(
      (snapshot) => !snapshot.general && !loadingSnapshots[snapshot.id] && snapshot.state !== SnapshotState.REMOVING,
    ).length
  }, [data, loadingSnapshots])
  const table = useReactTable({
    columnResizeMode: 'onEnd',
    data,
    columns,
    defaultColumn: DEFAULT_TABLE_COLUMN,
    getCoreRowModel: getCoreRowModel(),
    initialState: {
      columnPinning: {
        left: ['select'],
        right: ['actions'],
      },
    },
    manualSorting: true,
    onSortingChange: (updater) => {
      const newTableSorting = typeof updater === 'function' ? updater(table.getState().sorting) : updater
      const newApiSorting = convertTableSortingToApiSorting(newTableSorting)
      onSortingChange(newApiSorting)
    },
    manualPagination: true,
    pageCount: pageCount || 1,
    onPaginationChange: pagination
      ? (updater) => {
          const newPagination = typeof updater === 'function' ? updater(table.getState().pagination) : updater
          onPaginationChange(newPagination)
        }
      : undefined,
    state: {
      sorting: tableSorting,
      pagination: {
        pageIndex: pagination?.pageIndex || 0,
        pageSize: pagination?.pageSize || 10,
      },
    },
    meta: {
      snapshot: {
        writePermitted,
        deletePermitted,
        loadingSnapshots,
        getRegionName,
        selectableCount,
        onDelete,
        loading,
        onActivate,
        onDeactivate,
      },
    },
    getRowId: (row) => row.id,
    enableRowSelection: deletePermitted,
  })

  const selectedRows = table.getSelectedRowModel().rows
  const hasSelection = selectedRows.length > 0
  const isEmpty = !loading && table.getRowModel().rows.length === 0
  const hasStateFilter = stateFilter.size > 0
  const hasRegionFilter = regionFilter.size > 0
  const hasFacetFilters = hasStateFilter || hasRegionFilter
  const hasFilters = hasFacetFilters || searchValue.trim().length > 0

  const [pendingBulkAction, setPendingBulkAction] = useState<SnapshotBulkAction | null>(null)
  const selectedSnapshots = selectedRows.map((row) => row.original)

  const pushFilter = (filterId: SnapshotFacetFilterId) => {
    setFacetFilterOrder((order) => (order.includes(filterId) ? order : [...order, filterId]))
  }

  const handleClearFilters = () => {
    onSearchChange('')
    onStateFilterChange(new Set())
    onRegionFilterChange(new Set())
    setFacetFilterOrder([])
  }

  const handleClearFacetFilters = () => {
    onStateFilterChange(new Set())
    onRegionFilterChange(new Set())
    setFacetFilterOrder([])
  }

  const facetFilters: SnapshotFacetFilter[] = [
    {
      id: 'state',
      active: hasStateFilter,
      filter: (
        <FacetedFilter
          key="state"
          title="State"
          className="h-8"
          icon={<Square />}
          options={SNAPSHOT_STATE_OPTIONS}
          values={stateFilter}
          onValuesChange={(values) => {
            onStateFilterChange(values)
            pushFilter('state')
          }}
        />
      ),
    },
    {
      id: 'region',
      active: hasRegionFilter,
      filter: (
        <FacetedFilter
          key="region"
          title="Region"
          className="h-8"
          contentClassName="w-64"
          icon={<Globe />}
          options={regionOptions}
          values={regionFilter}
          onValuesChange={(values) => {
            onRegionFilterChange(values)
            pushFilter('region')
          }}
        />
      ),
    },
  ]
  const activeFilters = [
    ...facetFilterOrder.flatMap((filterId) => {
      const filter = facetFilters.find(({ id }) => id === filterId)
      return filter?.active ? [filter] : []
    }),
    ...facetFilters.filter(({ id, active }) => active && !facetFilterOrder.includes(id)),
  ]

  const bulkActionCounts = useMemo(() => getSnapshotBulkActionCounts(selectedSnapshots), [selectedSnapshots])

  const handleBulkActionConfirm = () => {
    if (!pendingBulkAction) return

    const handlers: Record<SnapshotBulkAction, () => void> = {
      [SnapshotBulkAction.Delete]: () => {
        if (onBulkDelete) {
          onBulkDelete(selectedSnapshots.filter(isSnapshotDeletable))
        }
      },
      [SnapshotBulkAction.Deactivate]: () => {
        if (onBulkDeactivate) {
          onBulkDeactivate(selectedSnapshots.filter(isSnapshotDeactivatable))
        }
      },
    }

    handlers[pendingBulkAction]()
    setPendingBulkAction(null)
    table.toggleAllRowsSelected(false)
  }

  const toggleAllRowsSelected = useCallback(
    (selected: boolean) => {
      if (selected) {
        for (const row of table.getRowModel().rows) {
          const isGeneral = row.original.general
          const isLoading = loadingSnapshots[row.original.id]
          const isRemoving = row.original.state === SnapshotState.REMOVING
          if (!isGeneral && !isLoading && !isRemoving) {
            row.toggleSelected(true)
          }
        }
      } else {
        table.toggleAllRowsSelected(false)
      }
    },
    [table, loadingSnapshots],
  )

  useSnapshotsCommands({
    writePermitted,
    deletePermitted,
    selectedCount: selectedRows.length,
    totalCount: data.length,
    selectableCount,
    toggleAllRowsSelected,
    bulkActionCounts,
    onDelete: () => setPendingBulkAction(SnapshotBulkAction.Delete),
    onDeactivate: () => setPendingBulkAction(SnapshotBulkAction.Deactivate),
    onActivate: () => onBulkActivate?.(selectedSnapshots.filter(isSnapshotActivatable)),
    onCreateSnapshot: onCreateSnapshot,
  })

  const { setIsOpen } = useCommandPaletteActions()
  const { trackOpened } = useCommandPaletteAnalytics()
  const handleOpenCommandPalette = () => {
    trackOpened('snapshot_selection_toast')
    setIsOpen(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SearchInput
            debounced
            value={searchValue}
            onValueChange={onSearchChange}
            placeholder="Search by Name"
            containerClassName="min-w-0 flex-1 sm:max-w-sm"
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <ResponsiveButton
                  icon={<ListFilter className="size-4" />}
                  variant="outline"
                  className="shrink-0 bg-transparent hover:bg-accent dark:bg-input/50 dark:hover:bg-accent"
                >
                  Filter
                </ResponsiveButton>
              }
            />
            <DropdownMenuContent className="w-48" align="start">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Square className="size-4" />
                  State
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-0 w-64">
                    <SnapshotStateFilter
                      value={stateFilter}
                      onFilterChange={(values) => {
                        onStateFilterChange(values)
                        pushFilter('state')
                      }}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Globe className="size-4" />
                  Region
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-0 w-64">
                    <SnapshotRegionFilter
                      value={regionFilter}
                      options={regionOptions}
                      onFilterChange={(values) => {
                        onRegionFilterChange(values)
                        pushFilter('region')
                      }}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {hasFacetFilters ? (
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {activeFilters.map(({ filter }) => filter)}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-3 text-muted-foreground hover:text-foreground"
            onClick={handleClearFacetFilters}
          >
            Clear
          </Button>
        </div>
      ) : null}
      <TableContainer
        className={cn({
          'min-h-[26rem]': isEmpty,
        })}
        empty={
          isEmpty ? (
            <TableEmptyState
              overlay
              colSpan={columns.length}
              message={hasFilters ? 'No matching snapshots found.' : 'No Snapshots yet.'}
              icon={<Box />}
              description={
                hasFilters ? null : (
                  <div className="space-y-2">
                    <p>
                      Snapshots are reproducible, pre-configured environments based on any Docker-compatible image. Use
                      them to define language runtimes, dependencies, and tools for your sandboxes.
                    </p>
                    <p>
                      Create one from the Dashboard, CLI, or SDK to get started. <br />
                      <a
                        href="https://www.daytona.io/docs/snapshots"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Read the Snapshots guide
                      </a>{' '}
                      to learn more.
                    </p>
                  </div>
                )
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={handleClearFilters}>
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
                {Array.from({ length: DEFAULT_PAGE_SIZE }).map((_, i) => (
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
                <TableRow
                  key={row.id}
                  data-selected={row.getIsSelected() || row.original.id === activeSnapshotId ? true : undefined}
                  className={cn('group/table-row transition-all', {
                    'opacity-50 pointer-events-none':
                      loadingSnapshots[row.original.id] || row.original.state === SnapshotState.REMOVING,
                    'cursor-pointer': onRowClick,
                  })}
                  onClick={() =>
                    onRowClick?.(
                      row.original,
                      table.getRowModel().rows.map((row) => row.original),
                    )
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      onClick={(event) => {
                        if (cell.column.id === 'select' || cell.column.id === 'actions') {
                          event.stopPropagation()
                        }
                      }}
                      className={cn({ 'group-hover/table-row:underline': cell.column.id === 'name' })}
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
        <Pagination table={table} selectionEnabled={deletePermitted} entityName="Snapshots" totalItems={totalItems} />
      </PageFooterPortal>
      <SelectionToastContainer>
        <AnimatePresence>
          {hasSelection && (
            <SelectionToast
              selectedCount={selectedRows.length}
              onClearSelection={() => table.resetRowSelection()}
              onActionClick={handleOpenCommandPalette}
            />
          )}
        </AnimatePresence>
      </SelectionToastContainer>

      <SnapshotBulkActionAlertDialog
        action={pendingBulkAction}
        count={
          pendingBulkAction
            ? {
                [SnapshotBulkAction.Delete]: bulkActionCounts.deletable,
                [SnapshotBulkAction.Deactivate]: bulkActionCounts.deactivatable,
              }[pendingBulkAction]
            : 0
        }
        onConfirm={handleBulkActionConfirm}
        onCancel={() => setPendingBulkAction(null)}
      />
    </div>
  )
}
