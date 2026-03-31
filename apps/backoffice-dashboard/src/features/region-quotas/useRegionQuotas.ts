import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { RegionQuotaFiltersDto } from '../../types'

interface UseRegionQuotasParams {
  filters: RegionQuotaFiltersDto
  page: number
  pageSize: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export const useRegionQuotas = ({ filters, page, pageSize, sortField, sortOrder }: UseRegionQuotasParams) => {
  return useQuery({
    queryKey: ['region-quotas', filters, page, pageSize, sortField, sortOrder],
    queryFn: async () => {
      const response = await BackofficeApiClient.searchRegionQuotas({
        filters: filters as any,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
      })

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch region quotas')
      }

      return {
        regionQuotas: response.data.regionQuotas,
        pagination: response.pagination,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}
