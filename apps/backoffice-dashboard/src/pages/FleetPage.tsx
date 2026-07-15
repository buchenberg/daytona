import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Wrench } from 'lucide-react'
import { PageLayout, PageHeaderBase, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { Button } from '@dashboard/ui/button'
import { FleetRunnerFiltersDto } from '@daytonaio/backoffice-api-client'
import { FilterPanel } from '../features/fleet/FilterPanel'
import { TableView } from '../features/fleet/TableView'
import { SyncStatus } from '../features/fleet/SyncStatus'
import { DiscrepanciesTable } from '../features/fleet/DiscrepanciesTable'
import { CreateRequestModal } from '../features/maintenance-requests/CreateRequestModal'
import { useFleetRunners } from '../features/fleet/useFleet'
import { useHasPermission } from '../providers/ApiProvider'

export const FleetPage = () => {
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<FleetRunnerFiltersDto>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sortField, setSortField] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [quickSearch, setQuickSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const canWrite = useHasPermission('fleet', 'write')
  const queryClient = useQueryClient()

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: quickSearch || undefined }))
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [quickSearch])

  const { data, isLoading, isFetching, refetch } = useFleetRunners({
    filters,
    page,
    pageSize,
    sortField,
    sortOrder,
  })

  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof FleetRunnerFiltersDto] !== undefined,
  ).length

  return (
    <PageLayout>
      <PageHeaderBase>
        <PageTitle>Fleet</PageTitle>
        {canWrite && selected.size > 0 && (
          <Button onClick={() => setCreateOpen(true)}>
            <Wrench className="mr-2 h-4 w-4" />
            Open maintenance request ({selected.size})
          </Button>
        )}
        <SyncStatus />
      </PageHeaderBase>
      <PageContent size="full">
        <TableView
          runners={data?.runners || []}
          loading={isLoading}
          refreshing={isFetching}
          pagination={{ page, pageSize, total: data?.pagination.total || 0 }}
          onPaginationChange={(newPage, newPageSize) => {
            setPage(newPage)
            setPageSize(newPageSize)
          }}
          onFilterClick={() => setFilterOpen(true)}
          onRefresh={() => refetch()}
          activeFilterCount={activeFilterCount}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={(field, order) => {
            setSortField(field)
            setSortOrder(order)
            setPage(1)
          }}
          searchValue={quickSearch}
          onSearchChange={setQuickSearch}
          selectedRows={canWrite ? selected : undefined}
          onSelectionChange={canWrite ? setSelected : undefined}
        />

        <DiscrepanciesTable />

        <CreateRequestModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setSelected(new Set())
            refetch()
            // Surface the new request in the bell/notifications immediately
            queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
          }}
          initialRunnerNames={[...selected]}
        />

        <FilterPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onApply={(newFilters) => {
            setFilters(newFilters)
            // Keep the table's quick-search box in step with the drawer's search field
            setQuickSearch(newFilters.search ?? '')
            setPage(1)
          }}
          onReset={() => {
            setFilters({})
            setQuickSearch('')
            setPage(1)
          }}
        />
      </PageContent>
    </PageLayout>
  )
}
