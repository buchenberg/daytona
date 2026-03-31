/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { SearchUsersDto } from '@daytonaio/backoffice-api-client'

export const useUsers = (searchDto: SearchUsersDto) => {
  return useQuery({
    queryKey: ['users', searchDto],
    queryFn: async () => {
      const response = await BackofficeApiClient.searchUsers(searchDto)
      return response
    },
    retry: false,
  })
}
