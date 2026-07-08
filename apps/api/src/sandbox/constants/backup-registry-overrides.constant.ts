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
  return BACKUP_REGISTRY_OVERRIDES_PER_ORGANIZATION[organizationId]
}
