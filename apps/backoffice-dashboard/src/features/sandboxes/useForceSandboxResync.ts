/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useMutation } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { SandboxResyncResponse } from '../../types'

export const useForceSandboxOrganizationResync = () => {
  return useMutation<SandboxResyncResponse, unknown, { sandboxId: string }>({
    mutationKey: ['sandbox-force-organization-resync'],
    mutationFn: ({ sandboxId }) => BackofficeApiClient.forceOrganizationResyncForSandbox(sandboxId),
  })
}
