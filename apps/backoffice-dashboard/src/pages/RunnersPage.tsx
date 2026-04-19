/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { FilterPanel } from '../features/runners/FilterPanel'
import { TableView } from '../features/runners/TableView'
import { EditRunnerModal } from '../features/runners/EditRunnerModal'
import { BulkEditRunnerModal } from '../features/runners/BulkEditRunnerModal'
import { ImportRunnerWizard } from '../features/runners/ImportRunnerWizard'
import { BulkActionToolbar } from '../components/BulkActionToolbar'
import { Button } from '@dashboard/ui/button'
import { Upload } from 'lucide-react'
import { useRunners } from '../features/runners/useRunners'
import { useHasPermission } from '../providers/ApiProvider'
import { RunnerFiltersDto, Runner } from '../types'

export const RunnersPage = () => {
  const canBulkWrite = useHasPermission('runners', 'write-bulk')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<RunnerFiltersDto>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
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

  // Edit state
  const [editOpen, setEditOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  const { data, isLoading, isFetching, refetch } = useRunners({
    filters,
    page,
    pageSize,
    sortField,
    sortOrder,
  })

  const handleApplyFilters = (newFilters: RunnerFiltersDto) => {
    setFilters(newFilters)
    setPage(1) // Reset to first page on filter change
  }

  const handleResetFilters = () => {
    setFilters({})
    setPage(1)
  }

  const handlePaginationChange = (newPage: number, newPageSize: number) => {
    setPage(newPage)
    setPageSize(newPageSize)
  }

  const handleEdit = (runner: Runner) => {
    setSelectedRunner(runner)
    setEditOpen(true)
  }

  const handleEditClose = () => {
    setEditOpen(false)
    setSelectedRunner(null)
  }

  const handleEditSuccess = () => {
    refetch()
  }

  const handleBulkEdit = () => {
    setBulkEditOpen(true)
  }

  const handleBulkEditClose = () => {
    setBulkEditOpen(false)
  }

  const handleBulkEditSuccess = () => {
    setSelectedRowKeys([])
    refetch()
  }

  const handleSelectionChange = (keys: string[]) => {
    setSelectedRowKeys(keys)
  }

  const handleClearSelection = () => {
    setSelectedRowKeys([])
  }

  const handleImportOpen = () => {
    setImportOpen(true)
  }

  const handleImportClose = () => {
    setImportOpen(false)
  }

  const handleImportSuccess = () => {
    refetch()
  }

  const selectedRunners = (data?.runners || []).filter((runner) => selectedRowKeys.includes(runner.id))

  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof RunnerFiltersDto] !== undefined,
  ).length

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Runners</PageTitle>
        {canBulkWrite && (
          <Button onClick={handleImportOpen} variant="outline" className="ml-auto">
            <Upload className="h-4 w-4 mr-2" />
            Import Runners
          </Button>
        )}
      </PageHeader>
      <PageContent size="full">
        {canBulkWrite && selectedRowKeys.length > 0 && (
          <BulkActionToolbar
            selectedCount={selectedRowKeys.length}
            onBulkEdit={handleBulkEdit}
            onClearSelection={handleClearSelection}
          />
        )}

        <TableView
          runners={data?.runners || []}
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
          activeFilterCount={activeFilterCount}
          selectedRowKeys={selectedRowKeys}
          onSelectionChange={handleSelectionChange}
          onEdit={handleEdit}
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

        <EditRunnerModal
          runner={selectedRunner}
          open={editOpen}
          onClose={handleEditClose}
          onSuccess={handleEditSuccess}
        />

        <BulkEditRunnerModal
          runners={selectedRunners}
          open={bulkEditOpen}
          onClose={handleBulkEditClose}
          onSuccess={handleBulkEditSuccess}
        />

        <ImportRunnerWizard open={importOpen} onClose={handleImportClose} onSuccess={handleImportSuccess} />
      </PageContent>
    </PageLayout>
  )
}
