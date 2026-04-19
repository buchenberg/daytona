/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { useState, useEffect } from 'react'
import { FilterPanel } from '../features/organization-users/FilterPanel'
import { TableView } from '../features/organization-users/TableView'
import { useOrganizationUsers } from '../features/organization-users/useOrganizationUsers'
import { EditOrganizationUserModal } from '../features/organization-users/EditOrganizationUserModal'
import { BulkEditOrganizationUserModal } from '../features/organization-users/BulkEditOrganizationUserModal'
import { BulkActionToolbar } from '../components/BulkActionToolbar'
import { useHasPermission } from '../providers/ApiProvider'
import { OrganizationUserFiltersDto, OrganizationUser } from '../types'

export const OrganizationUsersPage = () => {
  const canBulkWrite = useHasPermission('organizationUsers', 'write-bulk')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<OrganizationUserFiltersDto>({})
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
  const [selectedOrganizationUser, setSelectedOrganizationUser] = useState<OrganizationUser | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  const { data, isLoading, isFetching, refetch } = useOrganizationUsers({
    filters,
    page,
    pageSize,
    sortField,
    sortOrder,
  })

  const handleApplyFilters = (newFilters: OrganizationUserFiltersDto) => {
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

  const handleEdit = (organizationUser: OrganizationUser) => {
    setSelectedOrganizationUser(organizationUser)
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
    (key) => filters[key as keyof OrganizationUserFiltersDto] !== undefined,
  ).length

  const selectedOrganizationUsers = (data?.organizationUsers || []).filter((u: OrganizationUser) =>
    selectedRowKeys.includes(`${u.organizationId}:${u.userId}`),
  )

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Organization Users</PageTitle>
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
          organizationUsers={data?.organizationUsers || []}
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

        <EditOrganizationUserModal
          organizationUser={selectedOrganizationUser}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />

        <BulkEditOrganizationUserModal
          organizationUsers={selectedOrganizationUsers}
          open={bulkEditOpen}
          onClose={() => setBulkEditOpen(false)}
          onSuccess={handleBulkEditSuccess}
        />
      </PageContent>
    </PageLayout>
  )
}
