/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { useState, useEffect } from 'react'
import { FilterPanel } from '../features/snapshots/FilterPanel'
import { TableView } from '../features/snapshots/TableView'
import { useSnapshots } from '../features/snapshots/useSnapshots'
import { EditSnapshotModal } from '../features/snapshots/EditSnapshotModal'
import { BulkEditSnapshotModal } from '../features/snapshots/BulkEditSnapshotModal'
import { PropagateSnapshotModal } from '../features/snapshots/PropagateSnapshotModal'
import { AddToWarmPoolModal } from '../features/snapshots/AddToWarmPoolModal'
import { BulkActionToolbar } from '../components/BulkActionToolbar'
import { useHasPermission } from '../providers/ApiProvider'
import { SnapshotFiltersDto, Snapshot } from '../types'

export const SnapshotsPage = () => {
  const canBulkWrite = useHasPermission('snapshots', 'write-bulk')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<SnapshotFiltersDto>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sortField, setSortField] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [quickSearch, setQuickSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, name: quickSearch || undefined }))
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [quickSearch])

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [propagateOpen, setPropagateOpen] = useState(false)
  const [warmPoolModalOpen, setWarmPoolModalOpen] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  const { data, isLoading, isFetching, refetch } = useSnapshots({
    filters,
    page,
    pageSize,
    sortField,
    sortOrder,
  })

  const handleApplyFilters = (newFilters: SnapshotFiltersDto) => {
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

  const handleEdit = (snapshot: Snapshot) => {
    setSelectedSnapshot(snapshot)
    setEditOpen(true)
  }

  const handlePropagate = (snapshot: Snapshot) => {
    setSelectedSnapshot(snapshot)
    setPropagateOpen(true)
  }

  const handleAddToWarmPool = (snapshot: Snapshot) => {
    setSelectedSnapshot(snapshot)
    setWarmPoolModalOpen(true)
  }

  const handleBulkEdit = () => {
    setBulkEditOpen(true)
  }

  const handleSelectionChange = (keys: string[]) => {
    setSelectedRowKeys(keys)
  }

  const handleEditSuccess = () => {
    refetch()
  }

  const handleBulkEditSuccess = () => {
    setSelectedRowKeys([])
    refetch()
  }

  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof SnapshotFiltersDto] !== undefined,
  ).length

  const selectedSnapshots = (data?.snapshots || []).filter((s) => selectedRowKeys.includes(s.id))

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Snapshots</PageTitle>
      </PageHeader>
      <PageContent size="full">
        {canBulkWrite && selectedRowKeys.length > 0 && (
          <BulkActionToolbar
            selectedCount={selectedRowKeys.length}
            onBulkEdit={handleBulkEdit}
            onClearSelection={() => setSelectedRowKeys([])}
          />
        )}

        <TableView
          snapshots={data?.snapshots || []}
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
          onPropagate={handlePropagate}
          onAddToWarmPool={handleAddToWarmPool}
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

        <EditSnapshotModal
          snapshot={selectedSnapshot}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />

        <BulkEditSnapshotModal
          snapshots={selectedSnapshots}
          open={bulkEditOpen}
          onClose={() => setBulkEditOpen(false)}
          onSuccess={handleBulkEditSuccess}
        />

        <PropagateSnapshotModal
          snapshot={selectedSnapshot}
          open={propagateOpen}
          onClose={() => setPropagateOpen(false)}
          onSuccess={handleEditSuccess}
        />

        <AddToWarmPoolModal
          snapshot={selectedSnapshot}
          open={warmPoolModalOpen}
          onClose={() => setWarmPoolModalOpen(false)}
          onSuccess={handleEditSuccess}
        />
      </PageContent>
    </PageLayout>
  )
}
