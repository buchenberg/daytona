/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { useState, useEffect } from 'react'
import { Label } from '@dashboard/ui/label'
import { Switch } from '@dashboard/ui/switch'
import { FilterPanel } from '../features/sandboxes/FilterPanel'
import { TableView } from '../features/sandboxes/TableView'
import { EditSandboxModal } from '../features/sandboxes/EditSandboxModal'
import { BulkEditModal } from '../features/sandboxes/BulkEditModal'
import { BulkActionToolbar } from '../components/BulkActionToolbar'
import { useSandboxes } from '../features/sandboxes/useSandboxes'
import { SandboxFiltersDto, SandboxState, Sandbox } from '../types'

export const SandboxesPage = () => {
  const [filterOpen, setFilterOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [selectedSandbox, setSelectedSandbox] = useState<Sandbox | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [filters, setFilters] = useState<SandboxFiltersDto>({
    excludeStates: [SandboxState.DESTROYED], // Default: hide destroyed sandboxes
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortField, setSortField] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [quickSearch, setQuickSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: quickSearch || undefined }))
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [quickSearch])

  const { data, isLoading, isFetching, refetch } = useSandboxes({
    filters,
    page,
    pageSize,
    sortField,
    sortOrder,
  })

  const handleApplyFilters = (newFilters: SandboxFiltersDto) => {
    setFilters(newFilters)
    setQuickSearch(newFilters.search || '')
    setPage(1) // Reset to first page on filter change
  }

  const handleResetFilters = () => {
    setFilters({
      excludeStates: [SandboxState.DESTROYED], // Keep default filter on reset
    })
    setQuickSearch('')
    setPage(1)
  }

  const handleToggleShowDestroyed = (checked: boolean) => {
    setFilters((prev) => ({
      ...prev,
      excludeStates: checked
        ? prev.excludeStates?.filter((s) => s !== SandboxState.DESTROYED)
        : [...(prev.excludeStates || []), SandboxState.DESTROYED],
    }))
    setPage(1)
  }

  const handleToggleErrorOnly = (checked: boolean) => {
    setFilters((prev) => ({
      ...prev,
      errorOnly: checked,
    }))
    setPage(1)
  }

  const showDestroyed = !filters.excludeStates?.includes(SandboxState.DESTROYED)

  const handlePaginationChange = (newPage: number, newPageSize: number) => {
    setPage(newPage)
    setPageSize(newPageSize)
  }

  // Count active filters, excluding the default "excludeStates: [DESTROYED]" filter
  const activeFilterCount = Object.keys(filters).filter((key) => {
    const value = filters[key as keyof SandboxFiltersDto]
    if (value === undefined) return false
    // Don't count the default excludeStates filter
    if (key === 'excludeStates') {
      const excludeStates = value as SandboxState[]
      const isDefault = excludeStates.length === 1 && excludeStates[0] === SandboxState.DESTROYED
      return !isDefault
    }
    return true
  }).length

  const handleEdit = (sandbox: Sandbox) => {
    setSelectedSandbox(sandbox)
    setEditOpen(true)
  }

  const handleEditSuccess = () => {
    refetch()
  }

  const handleEditClose = () => {
    setEditOpen(false)
    setSelectedSandbox(null)
  }

  const handleSelectionChange = (keys: string[]) => {
    setSelectedRowKeys(keys)
  }

  const handleBulkEdit = () => {
    setBulkEditOpen(true)
  }

  const handleBulkEditSuccess = () => {
    refetch()
    setSelectedRowKeys([])
  }

  const handleBulkEditClose = () => {
    setBulkEditOpen(false)
  }

  const handleClearSelection = () => {
    setSelectedRowKeys([])
  }

  const selectedSandboxes = (data?.sandboxes || []).filter((s: Sandbox) => selectedRowKeys.includes(s.id))

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Sandboxes</PageTitle>
        <div className="flex items-center gap-6 ml-auto">
          <div className="flex items-center gap-2">
            <Label htmlFor="show-destroyed">Show Destroyed:</Label>
            <Switch id="show-destroyed" checked={showDestroyed} onCheckedChange={handleToggleShowDestroyed} />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="errors-only" className="text-destructive">
              Errors Only:
            </Label>
            <Switch id="errors-only" checked={filters.errorOnly || false} onCheckedChange={handleToggleErrorOnly} />
          </div>
        </div>
      </PageHeader>
      <PageContent size="full">
        {selectedRowKeys.length > 0 && (
          <BulkActionToolbar
            selectedCount={selectedRowKeys.length}
            onBulkEdit={handleBulkEdit}
            onClearSelection={handleClearSelection}
          />
        )}

        <TableView
          sandboxes={data?.sandboxes || []}
          loading={isLoading}
          refreshing={isFetching}
          pagination={{
            current: page,
            pageSize,
            total: data?.pagination.total || 0,
          }}
          onPaginationChange={handlePaginationChange}
          onFilterClick={() => setFilterOpen(true)}
          onRefresh={() => refetch()}
          onEdit={handleEdit}
          activeFilterCount={activeFilterCount}
          selectedRowKeys={selectedRowKeys}
          onSelectionChange={handleSelectionChange}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={(field, order) => {
            setSortField(field)
            setSortOrder(order)
            setPage(1)
          }}
          searchValue={quickSearch}
          onSearchChange={setQuickSearch}
        />
        <FilterPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
        />
        <EditSandboxModal
          sandbox={selectedSandbox}
          open={editOpen}
          onClose={handleEditClose}
          onSuccess={handleEditSuccess}
        />
        <BulkEditModal
          sandboxes={selectedSandboxes}
          open={bulkEditOpen}
          onClose={handleBulkEditClose}
          onSuccess={handleBulkEditSuccess}
        />
      </PageContent>
    </PageLayout>
  )
}
