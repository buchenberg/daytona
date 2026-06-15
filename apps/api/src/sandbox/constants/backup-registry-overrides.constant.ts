/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

/**
 * Hardcoded backup registry overrides per organization.
 *
 * Sandboxes belonging to these organizations will always use the specified
 * docker registry ID for new backups, regardless of region-based selection
 * or any previously assigned backup registry.
 *
 * The key is the organization ID and the value is the docker registry ID.
 */
export const BACKUP_REGISTRY_OVERRIDES_PER_ORGANIZATION: Record<string, string> = {
  // '55717397-f840-4f5b-a829-77fd6f7cb2fc': '360ca1bc-6e41-4aa4-9972-206c8997abee',
}

export function getBackupRegistryOverride(organizationId: string): string | undefined {
  if (organizationId != '55717397-f840-4f5b-a829-77fd6f7cb2fc') {
    return undefined
  }

  if (Math.random() < 0.5) {
    return '360ca1bc-6e41-4aa4-9972-206c8997abee'
  } else {
    if (Math.random() < 0.5) {
      return '20da41eb-6031-4d3a-849f-813024bebd60'
    } else {
      return '623bc3ad-4709-4f20-a795-f62fa1de5caa'
    }
  }

  // return BACKUP_REGISTRY_OVERRIDES_PER_ORGANIZATION[organizationId]
}
