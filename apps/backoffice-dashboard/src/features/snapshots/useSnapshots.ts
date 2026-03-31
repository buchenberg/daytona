import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { SnapshotFiltersDto } from '../../types'

interface UseSnapshotsParams {
  filters: SnapshotFiltersDto
  page: number
  pageSize: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export const useSnapshots = ({ filters, page, pageSize, sortField, sortOrder }: UseSnapshotsParams) => {
  return useQuery({
    queryKey: ['snapshots', filters, page, pageSize, sortField, sortOrder],
    queryFn: async () => {
      // Convert Date fields to ISO strings for API
      const apiFilters = {
        ...filters,
        createdAfter: filters.createdAfter?.toISOString(),
        createdBefore: filters.createdBefore?.toISOString(),
        lastUsedAfter: filters.lastUsedAfter?.toISOString(),
        lastUsedBefore: filters.lastUsedBefore?.toISOString(),
      }

      const response = await BackofficeApiClient.searchSnapshots({
        filters: apiFilters as any,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
      })

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch snapshots')
      }

      return {
        snapshots: response.data.snapshots,
        pagination: response.pagination,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}
