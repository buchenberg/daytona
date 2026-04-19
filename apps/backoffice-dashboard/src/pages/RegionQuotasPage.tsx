/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { useState, useEffect } from 'react'
import { TableView } from '../features/region-quotas/TableView'
import { useRegionQuotas } from '../features/region-quotas/useRegionQuotas'
import { BulkActionToolbar } from '../components/BulkActionToolbar'
import { FilterPanel } from '../features/region-quotas/FilterPanel'
import { EditRegionQuotaModal } from '../features/region-quotas/EditRegionQuotaModal'
import { BulkEditRegionQuotaModal as BulkEditModal } from '../features/region-quotas/BulkEditRegionQuotaModal'
import { useHasPermission } from '../providers/ApiProvider'
import { RegionQuotaFiltersDto, RegionQuota } from '../types'

export const RegionQuotasPage = () => {
  const canBulkWrite = useHasPermission('regionQuotas', 'write-bulk')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<RegionQuotaFiltersDto>({})
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

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [selectedRegionQuota, setSelectedRegionQuota] = useState<RegionQuota | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  const { data, isLoading, isFetching, refetch } = useRegionQuotas({
    filters,
    page,
    pageSize,
    sortField,
    sortOrder,
  })

  const handleApplyFilters = (newFilters: RegionQuotaFiltersDto) => {
    setFilters(newFilters)
    setQuickSearch(newFilters.search || '')
    setPage(1) // Reset to first page on filter change
  }

  const handleResetFilters = () => {
    setFilters({})
    setQuickSearch('')
    setPage(1)
  }

  const handlePaginationChange = (newPage: number, newPageSize: number) => {
    setPage(newPage)
    setPageSize(newPageSize)
  }

  const handleEdit = (regionQuota: RegionQuota) => {
    setSelectedRegionQuota(regionQuota)
    setEditOpen(true)
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
    (key) => filters[key as keyof RegionQuotaFiltersDto] !== undefined,
  ).length

  const selectedRegionQuotas = (data?.regionQuotas || []).filter((rq: RegionQuota) =>
    selectedRowKeys.includes(`${rq.organizationId}:${rq.regionId}`),
  )

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Region Quotas</PageTitle>
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
          regionQuotas={data?.regionQuotas || []}
          loading={isLoading}
          refreshing={isFetching}
          pagination={{
            page,
            pageSize,
            total: data?.pagination.total || 0,
          }}
          onPaginationChange={handlePaginationChange}
          onFilterClick={() => setFilterOpen(true)}
          onRefresh={refetch}
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

        <EditRegionQuotaModal
          regionQuota={selectedRegionQuota}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />

        <BulkEditModal
          regionQuotas={selectedRegionQuotas}
          open={bulkEditOpen}
          onClose={() => setBulkEditOpen(false)}
          onSuccess={handleBulkEditSuccess}
        />
      </PageContent>
    </PageLayout>
  )
}
