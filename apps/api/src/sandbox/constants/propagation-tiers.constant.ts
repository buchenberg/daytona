/**
 * Propagation tiers keyed by regionId. Each entry maps a cpuQuota threshold to the percentage of shared runners to propagate to.
 *
 * Thresholds must be sorted descending. The first matching threshold is used.
 *
 * The "default" key is used as a fallback when no region-specific tiers are defined.
 */
export const REGION_PROPAGATION_TIERS: Record<string, { threshold: number; percentage: number; minimum: number }[]> = {
  RL: [
    { threshold: 10000, percentage: 90, minimum: 0 },
    { threshold: 5000, percentage: 50, minimum: 0 },
    { threshold: 1000, percentage: 25, minimum: 0 },
    { threshold: 250, percentage: 12, minimum: 0 },
    { threshold: 0, percentage: 8, minimum: 0 },
  ],
  default: [
    { threshold: 10000, percentage: 45, minimum: 40 },
    { threshold: 5000, percentage: 30, minimum: 40 },
    { threshold: 1000, percentage: 15, minimum: 40 },
    { threshold: 250, percentage: 6, minimum: 10 },
    { threshold: 100, percentage: 4, minimum: 5 },
    { threshold: 0, percentage: 2, minimum: 3 },
  ],
}

export const ORGANIZATION_PROPAGATION_OVERRIDES: Record<
  string,
  { threshold: number; percentage: number; minimum: number }[]
> = {
  '8c0f7497-8037-4515-89a3-992bb9230cbc': [{ threshold: 0, percentage: 13, minimum: 0 }],
  'c543c338-b39a-4abf-a07a-095c0b23a380': [{ threshold: 0, percentage: 5, minimum: 0 }], // million — cap shared (US) propagation at 5%
}

export const DEDICATED_REGION_PROPAGATION_OVERRIDES: Record<string, { percentage: number; minimum: number }> = {
  'c543c338-b39a-4abf-a07a-095c0b23a380': { percentage: 10, minimum: 1 }, // million — cap dedicated propagation at 10%
}

export const FROM_SANDBOX_PROPAGATION_OVERRIDES: Record<
  string,
  { threshold: number; percentage: number; minimum: number }[]
> = {
  '55717397-f840-4f5b-a829-77fd6f7cb2fc': [{ threshold: 0, percentage: 10, minimum: 3 }],
}

const FROM_SANDBOX_DEFAULT_TIERS = [{ threshold: 0, percentage: 3, minimum: 3 }]

/**
 * Get the propagation parameters for a snapshot based on the CPU quota that the organization has in the snapshot region.
 *
 * @param regionId Provide to use region-specific propagation tiers, otherwise the default tiers are used.
 * @param organizationId Provide to use organization-specific propagation overrides.
 * @returns factor - a number between 0 and 1 representing the fraction of shared runners to propagate to;
 *          minimum - the minimum number of runners to propagate to regardless of the factor.
 */
export function getSnapshotPropagationFactor(
  cpuQuota: number,
  snapshot: {
    organizationId?: string
    imageName?: string
    buildInfo?: unknown
    buildInfoSnapshotRef?: string | null
    gpu?: number
  },
  regionId?: string,
): { factor: number; minimum: number } {
  if (snapshot.gpu && snapshot.gpu > 0) {
    return { factor: 1, minimum: 0 }
  }

  const fromSandbox = !snapshot.imageName && !snapshot.buildInfo && !snapshot.buildInfoSnapshotRef
  const orgTiers = snapshot.organizationId
    ? (fromSandbox ? FROM_SANDBOX_PROPAGATION_OVERRIDES : ORGANIZATION_PROPAGATION_OVERRIDES)[snapshot.organizationId]
    : undefined
  const defaultTiers = fromSandbox
    ? FROM_SANDBOX_DEFAULT_TIERS
    : ((regionId && REGION_PROPAGATION_TIERS[regionId]) ?? REGION_PROPAGATION_TIERS['default'])
  const tiers = orgTiers ?? defaultTiers
  const tier = tiers.find((t) => cpuQuota >= t.threshold)

  if (!tier) {
    return { factor: 0.08, minimum: 0 }
  }

  return { factor: Math.min(tier.percentage / 100, 1), minimum: tier.minimum }
}
