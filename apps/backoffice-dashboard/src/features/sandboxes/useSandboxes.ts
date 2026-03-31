import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { SandboxFiltersDto } from '../../types'

interface UseSandboxesParams {
  filters: SandboxFiltersDto
  page: number
  pageSize: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export const useSandboxes = ({ filters, page, pageSize, sortField, sortOrder }: UseSandboxesParams) => {
  return useQuery({
    queryKey: ['sandboxes', filters, page, pageSize, sortField, sortOrder],
    queryFn: async () => {
      // Convert Date fields to ISO strings for API
      const apiFilters = {
        ...filters,
        // Dates are sent as-is, axios will serialize them
        createdAfter: filters.createdAfter,
        createdBefore: filters.createdBefore,
      }

      const response = await BackofficeApiClient.searchSandboxes({
        filters: apiFilters,
        pagination: { page, pageSize },
      })

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch sandboxes')
      }

      return {
        sandboxes: response.data.sandboxes,
        pagination: response.pagination,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}
