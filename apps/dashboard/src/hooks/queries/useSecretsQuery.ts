import { ListSecretsPaginatedOrderEnum, ListSecretsPaginatedSortEnum, ListSecretsResponse } from '@daytona/api-client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { queryKeys } from './queryKeys'

export interface SecretFilters {
  name?: string
}

export interface SecretSorting {
  field: ListSecretsPaginatedSortEnum
  direction: ListSecretsPaginatedOrderEnum
}

export const DEFAULT_SECRET_SORTING: SecretSorting = {
  field: ListSecretsPaginatedSortEnum.CREATED_AT,
  direction: ListSecretsPaginatedOrderEnum.DESC,
}

export interface SecretQueryParams {
  cursor?: string
  limit: number
  filters?: SecretFilters
  sorting?: SecretSorting
}

export const useSecretsQuery = (organizationId: string | undefined, params: SecretQueryParams) => {
  const api = useApi()

  return useQuery<ListSecretsResponse>({
    queryKey: queryKeys.secrets.list(organizationId ?? '', params),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        throw new Error('No organization selected')
      }

      const { cursor, limit, filters = {}, sorting = DEFAULT_SECRET_SORTING } = params

      const response = await api.secretApi.listSecretsPaginated(
        organizationId,
        cursor,
        limit,
        filters.name,
        sorting.field,
        sorting.direction,
      )
      return response.data
    },
    placeholderData: keepPreviousData,
  })
}
