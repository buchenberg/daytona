import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import { FleetRunnerFiltersDto } from '@daytonaio/backoffice-api-client'

interface UseFleetRunnersParams {
  filters: FleetRunnerFiltersDto
  page: number
  pageSize: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export const useFleetRunners = ({ filters, page, pageSize, sortField, sortOrder }: UseFleetRunnersParams) =>
  useQuery({
    queryKey: ['fleet-runners', filters, page, pageSize, sortField, sortOrder],
    queryFn: async () => {
      const response = await BackofficeApiClient.searchFleetRunners({
        filters,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
      })
      if (!response.success || !response.data) throw new Error('Failed to fetch fleet runners')
      return { runners: response.data.runners, pagination: response.pagination }
    },
    refetchInterval: 60 * 1000,
  })

export const useFleetFilterOptions = () =>
  useQuery({
    queryKey: ['fleet-filter-options'],
    queryFn: () => BackofficeApiClient.getFleetFilterOptions(),
    staleTime: 5 * 60 * 1000,
  })

export const useFleetRunner = (name: string) =>
  useQuery({
    queryKey: ['fleet-runners', 'detail', name],
    queryFn: () => BackofficeApiClient.getFleetRunner(name),
    enabled: !!name,
    refetchInterval: 30 * 1000,
  })

export const useFleetDiscrepancies = () =>
  useQuery({
    queryKey: ['fleet-discrepancies'],
    queryFn: () => BackofficeApiClient.getFleetDiscrepancies(),
    refetchInterval: 60 * 1000,
  })

export const useFleetSyncStatus = () =>
  useQuery({
    queryKey: ['fleet-sync-status'],
    queryFn: () => BackofficeApiClient.getFleetSyncStatus(),
    refetchInterval: 30 * 1000,
  })
