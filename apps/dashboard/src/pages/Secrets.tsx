/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { type CommandConfig, useRegisterCommands } from '@/components/CommandPalette'
import { CreateSecretSheet } from '@/components/CreateSecretSheet'
import { DeleteSecretDialog } from '@/components/DeleteSecretDialog'
import { PageContent, PageFooter, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { SecretTable } from '@/components/SecretTable'
import { UpdateSecretDialog } from '@/components/UpdateSecretDialog'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/constants/Pagination'
import {
  DEFAULT_SECRET_SORTING,
  SecretQueryParams,
  SecretSorting,
  useSecretsQuery,
} from '@/hooks/queries/useSecretsQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import {
  ListSecretsPaginatedOrderEnum,
  ListSecretsPaginatedSortEnum,
  OrganizationRolePermissionsEnum,
  Secret,
} from '@daytona/api-client'
import { PlusIcon } from 'lucide-react'
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const SECRET_SORT_FIELDS = Object.values(ListSecretsPaginatedSortEnum)
const SECRET_SORT_DIRECTIONS = Object.values(ListSecretsPaginatedOrderEnum)

const secretViewSearchParams = {
  limit: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
  search: parseAsString.withDefault(''),
  sort: parseAsString.withDefault(DEFAULT_SECRET_SORTING.field),
  order: parseAsString.withDefault(DEFAULT_SECRET_SORTING.direction),
}

function normalizePageSize(pageSize: number) {
  return PAGE_SIZE_OPTIONS.includes(pageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ? pageSize : DEFAULT_PAGE_SIZE
}

function normalizeSorting(field: string, direction: string): SecretSorting {
  const sortField = SECRET_SORT_FIELDS.includes(field as ListSecretsPaginatedSortEnum)
    ? (field as ListSecretsPaginatedSortEnum)
    : DEFAULT_SECRET_SORTING.field
  const sortDirection = SECRET_SORT_DIRECTIONS.includes(direction as ListSecretsPaginatedOrderEnum)
    ? (direction as ListSecretsPaginatedOrderEnum)
    : DEFAULT_SECRET_SORTING.direction

  return {
    field: sortField,
    direction: sortDirection,
  }
}

function isDefaultSorting(sorting: SecretSorting) {
  return sorting.field === DEFAULT_SECRET_SORTING.field && sorting.direction === DEFAULT_SECRET_SORTING.direction
}

const Secrets: React.FC = () => {
  const createSecretSheetRef = useRef<{ open: () => void }>(null)
  const [secretToEdit, setSecretToEdit] = useState<Secret | null>(null)
  const [secretToDelete, setSecretToDelete] = useState<Secret | null>(null)
  const [viewParams, setViewParams] = useQueryStates(secretViewSearchParams)

  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([])

  const resetCursor = useCallback(() => {
    setCursor(undefined)
    setCursorHistory([])
  }, [])

  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()

  const pageSize = normalizePageSize(viewParams.limit)
  const searchQuery = viewParams.search
  // searchQuery is URL state and may be untrimmed (e.g. ?search=%20%20); this is
  // the single predicate for both the query filter and the quota counter below
  const searchFilter = searchQuery.trim()
  const sorting = useMemo<SecretSorting>(
    () => normalizeSorting(viewParams.sort, viewParams.order),
    [viewParams.order, viewParams.sort],
  )

  const queryParams = useMemo<SecretQueryParams>(
    () => ({
      cursor,
      limit: pageSize,
      sorting,
      filters: searchFilter ? { name: searchFilter } : undefined,
    }),
    [cursor, pageSize, sorting, searchFilter],
  )

  const secretsQuery = useSecretsQuery(selectedOrganization?.id, queryParams)

  useEffect(() => {
    if (secretsQuery.error) {
      handleApiError(secretsQuery.error, 'Failed to fetch secrets')
    }
  }, [secretsQuery.error])

  const handleNextPage = useCallback(() => {
    const nextCursor = secretsQuery.data?.nextCursor
    // While a page transition is in flight, keepPreviousData still exposes the
    // previous page's nextCursor; advancing again would corrupt cursor history
    if (!nextCursor || secretsQuery.isPlaceholderData || secretsQuery.isFetching) {
      return
    }

    setCursorHistory((prev) => [...prev, cursor])
    setCursor(nextCursor)
  }, [cursor, secretsQuery.data?.nextCursor, secretsQuery.isFetching, secretsQuery.isPlaceholderData])

  const handlePreviousPage = useCallback(() => {
    if (cursorHistory.length > 0) {
      const newHistory = [...cursorHistory]
      const previousCursor = newHistory.pop()
      setCursorHistory(newHistory)
      setCursor(previousCursor)
    }
  }, [cursorHistory])

  // If the current page empties out (e.g. after deleting the last item on it), step back
  useEffect(() => {
    if (!secretsQuery.isPlaceholderData && secretsQuery.data?.items.length === 0 && cursorHistory.length > 0) {
      handlePreviousPage()
    }
  }, [cursorHistory.length, handlePreviousPage, secretsQuery.data?.items.length, secretsQuery.isPlaceholderData])

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const nextPageSize = normalizePageSize(newPageSize)
      setViewParams({ limit: nextPageSize === DEFAULT_PAGE_SIZE ? null : nextPageSize })
      resetCursor()
    },
    [resetCursor, setViewParams],
  )

  const handleSortingChange = useCallback(
    (newSorting: SecretSorting) => {
      setViewParams({
        sort: isDefaultSorting(newSorting) ? null : newSorting.field,
        order: isDefaultSorting(newSorting) ? null : newSorting.direction,
      })
      resetCursor()
    },
    [resetCursor, setViewParams],
  )

  const handleSearchChange = useCallback(
    (value: string) => {
      setViewParams({
        search: value.trim() || null,
      })
      resetCursor()
    },
    [resetCursor, setViewParams],
  )

  const managePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.MANAGE_SECRETS),
    [authenticatedUserHasPermission],
  )

  const rootCommands: CommandConfig[] = useMemo(() => {
    if (!managePermitted) {
      return []
    }

    return [
      {
        id: 'create-secret',
        label: 'Create Secret',
        icon: <PlusIcon className="w-4 h-4" />,
        onSelect: () => createSecretSheetRef.current?.open(),
      },
    ]
  }, [managePermitted])

  useRegisterCommands(rootCommands, { groupId: 'secret-actions', groupLabel: 'Secret actions', groupOrder: 0 })

  return (
    <PageLayout contained>
      <PageHeader />

      <PageContent size="full" className="overflow-hidden">
        <PageIntro
          title="Secrets"
          desc={
            secretsQuery.data && selectedOrganization?.secretQuota != null && !searchFilter
              ? `${secretsQuery.data.total}/${selectedOrganization.secretQuota} secrets used`
              : undefined
          }
          actions={
            managePermitted ? (
              <CreateSecretSheet organizationId={selectedOrganization?.id} ref={createSecretSheetRef} />
            ) : undefined
          }
        />
        <SecretTable
          data={secretsQuery.data?.items ?? []}
          loading={secretsQuery.isLoading}
          onEdit={(secret) => setSecretToEdit(secret)}
          onDelete={(secret) => setSecretToDelete(secret)}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          hasNextPage={Boolean(secretsQuery.data?.nextCursor)}
          hasPreviousPage={cursorHistory.length > 0}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          searchValue={searchQuery}
          onSearchChange={handleSearchChange}
          sorting={sorting}
          onSortingChange={handleSortingChange}
        />

        <UpdateSecretDialog
          secret={secretToEdit}
          open={!!secretToEdit}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setSecretToEdit(null)
            }
          }}
          organizationId={selectedOrganization?.id}
        />

        <DeleteSecretDialog
          secret={secretToDelete}
          open={!!secretToDelete}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setSecretToDelete(null)
            }
          }}
          organizationId={selectedOrganization?.id}
        />
      </PageContent>
      <PageFooter />
    </PageLayout>
  )
}

export default Secrets
