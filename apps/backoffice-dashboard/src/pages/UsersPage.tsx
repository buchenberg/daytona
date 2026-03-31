/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { PageLayout, PageHeader, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { TableView } from '../features/users/TableView'
import { UserFiltersPanel } from '../features/users/UserFiltersPanel'
import { DeleteUserWizard } from '../features/users/DeleteUserWizard'
import { useUsers } from '../features/users/useUsers'
import type { UserFiltersDto } from '@daytonaio/backoffice-api-client'
import type { User } from '../types'

export const UsersPage = () => {
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<UserFiltersDto>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortField, setSortField] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [quickSearch, setQuickSearch] = useState('')
  const [hideDeleted, setHideDeleted] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showDeleteWizard, setShowDeleteWizard] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: quickSearch || undefined }))
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [quickSearch])

  const {
    data: response,
    isLoading,
    isFetching,
    refetch,
  } = useUsers({
    filters,
    pagination: { page, pageSize },
    sort: { field: sortField, order: sortOrder },
  })

  const allUsers = response?.data?.users || []
  const users = hideDeleted ? allUsers.filter((u) => u.email !== 'DELETED' && !u.id.startsWith('DELETED_')) : allUsers
  const total = hideDeleted ? users.length : response?.pagination?.total || 0

  const handleApplyFilters = (newFilters: UserFiltersDto) => {
    setFilters(newFilters)
    setQuickSearch(newFilters.search || '')
    setPage(1)
  }

  const handleResetFilters = () => {
    setFilters({})
    setQuickSearch('')
    setPage(1)
  }

  const handleDelete = (user: User) => {
    setSelectedUser(user)
    setShowDeleteWizard(true)
  }

  const handleDeleteSuccess = () => {
    setShowDeleteWizard(false)
    setSelectedUser(null)
    refetch()
  }

  const handlePaginationChange = (newPage: number, newPageSize: number) => {
    setPage(newPage)
    setPageSize(newPageSize)
  }

  // Count active drawer filters (exclude inline search)
  const activeFilterCount = Object.keys(filters).filter((key) => {
    if (key === 'search') return false
    return filters[key as keyof UserFiltersDto] !== undefined
  }).length

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Users</PageTitle>
      </PageHeader>
      <PageContent size="full">
        <TableView
          users={users}
          loading={isLoading}
          refreshing={isFetching}
          pagination={{
            current: page,
            pageSize,
            total,
          }}
          onPaginationChange={handlePaginationChange}
          onFilterClick={() => setFilterOpen(true)}
          onRefresh={() => refetch()}
          onDelete={handleDelete}
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
        />

        <UserFiltersPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
          hideDeleted={hideDeleted}
          onHideDeletedChange={setHideDeleted}
        />

        <DeleteUserWizard
          open={showDeleteWizard}
          onClose={() => {
            setShowDeleteWizard(false)
            setSelectedUser(null)
          }}
          onSuccess={handleDeleteSuccess}
          initialUserId={selectedUser?.id || ''}
        />
      </PageContent>
    </PageLayout>
  )
}
