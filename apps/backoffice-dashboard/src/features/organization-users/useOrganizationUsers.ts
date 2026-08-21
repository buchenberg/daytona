import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { OrganizationUserFiltersDto } from '../../types'

interface UseOrganizationUsersParams {
  filters: OrganizationUserFiltersDto
  page: number
  pageSize: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export const useOrganizationUsers = ({ filters, page, pageSize, sortField, sortOrder }: UseOrganizationUsersParams) => {
  return useQuery({
    queryKey: ['organization-users', filters, page, pageSize, sortField, sortOrder],
    queryFn: async () => {
      // Convert Date fields to ISO strings for API
      const apiFilters = {
        ...filters,
        createdAfter: filters.createdAfter?.toISOString(),
        createdBefore: filters.createdBefore?.toISOString(),
      }

      const response = await BackofficeApiClient.searchOrganizationUsers({
        filters: apiFilters as any,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
      })

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch organization users')
      }

      return {
        organizationUsers: response.data.organizationUsers,
        pagination: response.pagination,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}
