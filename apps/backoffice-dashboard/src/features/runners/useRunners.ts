import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { RunnerFiltersDto } from '../../types'

interface UseRunnersParams {
  filters: RunnerFiltersDto
  page: number
  pageSize: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export const useRunners = ({ filters, page, pageSize, sortField, sortOrder }: UseRunnersParams) => {
  return useQuery({
    queryKey: ['runners', filters, page, pageSize, sortField, sortOrder],
    queryFn: async () => {
      // Convert Date fields to ISO strings for API
      const apiFilters = {
        ...filters,
        lastCheckedAfter: filters.lastCheckedAfter?.toISOString(),
        lastCheckedBefore: filters.lastCheckedBefore?.toISOString(),
      }

      const response = await BackofficeApiClient.searchRunners({
        filters: apiFilters as any,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
      })

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch runners')
      }

      return {
        runners: response.data.runners,
        pagination: response.pagination,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}
