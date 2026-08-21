import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@dashboard/ui/badge'
import { Input } from '@dashboard/ui/input'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { DiscrepancyDto, DiscrepancyKind } from '@daytonaio/backoffice-api-client'
import { statusLabel } from '@backoffice/lib/utils'
import { useFleetDiscrepancies } from './useFleet'

const KIND_VARIANTS: Record<DiscrepancyKind, 'warning' | 'info' | 'destructive'> = {
  [DiscrepancyKind.NOT_IN_PROD]: 'warning',
  [DiscrepancyKind.DISABLED_BUT_ACTIVE]: 'warning',
  [DiscrepancyKind.PROD_ONLY]: 'info',
  [DiscrepancyKind.UNRESPONSIVE]: 'destructive',
}

// Sort accessors per column key; sorting and filtering are client-side, the
// endpoint returns the full list.
const FIELDS: Record<string, (d: DiscrepancyDto) => string> = {
  // Match/sort on the displayed label ("Not in prod"), not the raw enum value
  kind: (d) => statusLabel(d.kind),
  runner: (d) => d.runnerName ?? '',
  domain: (d) => d.domain ?? '',
  detail: (d) => d.detail,
}

const columns: Column<DiscrepancyDto>[] = [
  {
    key: 'kind',
    title: 'Kind',
    width: '180px',
    sortable: true,
    render: (d) => <Badge variant={KIND_VARIANTS[d.kind]}>{statusLabel(d.kind)}</Badge>,
  },
  {
    key: 'runner',
    title: 'Runner',
    width: '140px',
    sortable: true,
    render: (d) =>
      d.runnerName ? (
        <Link to={`/fleet/${d.runnerName}`} className="font-mono hover:underline">
          {d.runnerName}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'domain',
    title: 'Domain',
    width: '220px',
    sortable: true,
    render: (d) => <span className="font-mono text-sm">{d.domain ?? '—'}</span>,
  },
  {
    key: 'detail',
    title: 'Detail',
    width: '380px',
    render: (d) => <span className="text-sm">{d.detail}</span>,
  },
]

// Compact inventory-vs-production drift section shown under the runners table.
export const DiscrepanciesTable = () => {
  const { data, isLoading, isError } = useFleetDiscrepancies()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('kind')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const all = data ?? []
  const query = search.trim().toLowerCase()
  const discrepancies = all
    .filter((d) => !query || Object.values(FIELDS).some((get) => get(d).toLowerCase().includes(query)))
    .sort((a, b) => FIELDS[sortField](a).localeCompare(FIELDS[sortField](b)) * (sortOrder === 'asc' ? 1 : -1))

  return (
    <section className="mt-8 space-y-2">
      <h3 className="text-sm font-semibold">Discrepancies</h3>
      {isError ? (
        <p className="text-sm text-destructive">Failed to load discrepancies — try refreshing.</p>
      ) : !isLoading && all.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inventory and production agree — nothing to see here.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search by kind, runner or domain..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="h-9 w-[220px]"
            />
            <p className="text-sm text-muted-foreground">
              {discrepancies.length} place{discrepancies.length === 1 ? '' : 's'} where the inventory and production
              disagree.
            </p>
          </div>
          <DataTable
            columns={columns}
            data={discrepancies.slice((page - 1) * pageSize, page * pageSize)}
            loading={isLoading}
            rowKey={(d) => `${d.kind}:${d.runnerName ?? d.domain}`}
            pagination={{ page, pageSize, total: discrepancies.length, pageSizeOptions: [5, 10, 20] }}
            onPaginationChange={(newPage, newPageSize) => {
              setPage(newPage)
              setPageSize(newPageSize)
            }}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortChange={(field, order) => {
              setSortField(field)
              setSortOrder(order)
              setPage(1)
            }}
          />
        </>
      )}
    </section>
  )
}
