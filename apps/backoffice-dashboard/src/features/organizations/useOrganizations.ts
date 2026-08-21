import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { OrganizationFiltersDto } from '../../types'

interface UseOrganizationsParams {
  filters: OrganizationFiltersDto
  page: number
  pageSize: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export const useOrganizations = ({ filters, page, pageSize, sortField, sortOrder }: UseOrganizationsParams) => {
  return useQuery({
    queryKey: ['organizations', filters, page, pageSize, sortField, sortOrder],
    queryFn: async () => {
      // Convert Date fields to ISO strings for API
      const apiFilters = {
        ...filters,
        createdAfter: filters.createdAfter?.toISOString(),
        createdBefore: filters.createdBefore?.toISOString(),
        suspendedAfter: filters.suspendedAfter?.toISOString(),
        suspendedBefore: filters.suspendedBefore?.toISOString(),
      }

      const response = await BackofficeApiClient.searchOrganizations({
        filters: apiFilters as any,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
      })

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch organizations')
      }

      return {
        organizations: response.data.organizations,
        pagination: response.pagination,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}
