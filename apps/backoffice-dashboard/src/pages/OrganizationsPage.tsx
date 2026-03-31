/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { FilterPanel } from '../features/organizations/FilterPanel'
import { TableView } from '../features/organizations/TableView'
import { useOrganizations } from '../features/organizations/useOrganizations'
import { EditOrganizationModal } from '../features/organizations/EditOrganizationModal'
import { BulkEditOrganizationModal } from '../features/organizations/BulkEditOrganizationModal'
import { InitializeWebhooksModal } from '../features/organizations/InitializeWebhooksModal'
import { BulkActionToolbar } from '../components/BulkActionToolbar'
import { OrganizationFiltersDto, Organization } from '../types'

export const OrganizationsPage = () => {
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<OrganizationFiltersDto>({})
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
  const [webhooksModalOpen, setWebhooksModalOpen] = useState(false)
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  const { data, isLoading, isFetching, refetch } = useOrganizations({
    filters,
    page,
    pageSize,
    sortField,
    sortOrder,
  })

  const handleApplyFilters = (newFilters: OrganizationFiltersDto) => {
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

  const handleEdit = (organization: Organization) => {
    setSelectedOrganization(organization)
    setEditOpen(true)
  }

  const handleInitializeWebhooks = (organization: Organization) => {
    setSelectedOrganization(organization)
    setWebhooksModalOpen(true)
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
    (key) => filters[key as keyof OrganizationFiltersDto] !== undefined,
  ).length

  const selectedOrganizations = (data?.organizations || []).filter((o) => selectedRowKeys.includes(o.id))

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Organizations</PageTitle>
      </PageHeader>
      <PageContent size="full">
        {selectedRowKeys.length > 0 && (
          <BulkActionToolbar
            selectedCount={selectedRowKeys.length}
            onBulkEdit={handleBulkEdit}
            onClearSelection={() => setSelectedRowKeys([])}
          />
        )}

        <TableView
          organizations={data?.organizations || []}
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
          onInitializeWebhooks={handleInitializeWebhooks}
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

        <EditOrganizationModal
          organization={selectedOrganization}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />

        <BulkEditOrganizationModal
          organizations={selectedOrganizations}
          open={bulkEditOpen}
          onClose={() => setBulkEditOpen(false)}
          onSuccess={handleBulkEditSuccess}
        />

        <InitializeWebhooksModal
          organization={selectedOrganization}
          open={webhooksModalOpen}
          onClose={() => setWebhooksModalOpen(false)}
          onSuccess={handleEditSuccess}
        />
      </PageContent>
    </PageLayout>
  )
}
