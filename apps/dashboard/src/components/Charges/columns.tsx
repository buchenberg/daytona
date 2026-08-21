import { formatAmount } from '@/lib/utils'
import { Charge } from '@daytona/billing-api-client'
import { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '../DataTableColumnHeader'
import { Badge } from '../ui/badge'
import { ChargesTableActions } from './ChargesTableActions'

export function getColumns(): ColumnDef<Charge>[] {
  return [
    {
      id: 'createdAt',
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} label="Date" />,
      cell: ({ row }) => {
        const timestamp = parseTimestamp(row.original.createdAt)
        return (
          <div className="w-full truncate">
            <span>
              {timestamp != null
                ? new Date(timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'}
            </span>
          </div>
        )
      },
      accessorFn: (row) => parseTimestamp(row.createdAt) ?? -Infinity,
      sortingFn: (rowA, rowB) => {
        return (
          (parseTimestamp(rowA.original.createdAt) ?? -Infinity) -
          (parseTimestamp(rowB.original.createdAt) ?? -Infinity)
        )
      },
    },
    {
      id: 'description',
      size: 320,
      minSize: 220,
      header: ({ column }) => <DataTableColumnHeader column={column} label="Description" />,
      accessorKey: 'description',
      cell: ({ row }) => {
        const charge = row.original
        return (
          <div className="flex flex-col min-w-0">
            <span className="truncate">{charge.description || '—'}</span>
            {charge.failureMessage && (
              <span className="text-xs text-destructive truncate" title={charge.failureMessage}>
                {charge.failureMessage}
              </span>
            )}
          </div>
        )
      },
      sortingFn: (rowA, rowB) => {
        return (rowA.original.description ?? '').localeCompare(rowB.original.description ?? '')
      },
    },
    {
      id: 'amountCents',
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} label="Amount" />,
      cell: ({ row }) => (
        <div className="w-full truncate">
          <span>{formatAmount(row.original.amountCents ?? 0)}</span>
        </div>
      ),
      accessorKey: 'amountCents',
      sortingFn: (rowA, rowB) => {
        return (rowA.original.amountCents ?? 0) - (rowB.original.amountCents ?? 0)
      },
    },
    {
      id: 'status',
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <div className="max-w-[120px] flex">
            <Badge variant={statusVariant(status)}>{formatStatus(status)}</Badge>
          </div>
        )
      },
      accessorKey: 'status',
      sortingFn: (rowA, rowB) => {
        return (rowA.original.status ?? '').localeCompare(rowB.original.status ?? '')
      },
    },
    {
      id: 'actions',
      header: () => null,
      size: 48,
      minSize: 48,
      maxSize: 48,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <ChargesTableActions charge={row.original} />
        </div>
      ),
    },
  ]
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

// Maps Stripe's charge.status values to our badge variants.
function statusVariant(status?: string): 'success' | 'destructive' | 'secondary' {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'destructive'
    default:
      return 'secondary'
  }
}

function formatStatus(status?: string): string {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}
