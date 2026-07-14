import { Column } from '@tanstack/react-table'

import { SortOrderIcon } from './SortIcon'

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>
  label: string
  dataState?: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  label,
  dataState,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const sortDirection = column.getIsSorted()

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sortDirection === 'asc')}
      className="group/sort-header flex h-full w-full items-center gap-2"
      {...(dataState && { 'data-state': dataState })}
    >
      {label}
      <SortOrderIcon sort={sortDirection || null} />
    </button>
  )
}
