import { SandboxClass } from '../enums/sandbox-class.enum'

export const GPU_REGION = 'gpu-experimental'

/*
 * Dedicated regions for runner assignment
 */
export const WRITER_DEDICATED_US = 'writer-dedicated-us'
export const WRITER_DEDICATED_EU = 'writer-dedicated-eu'
export const RL01_REGION = 'RL01'
export const META_LARGE_SANDBOX_REGION = 'us-central-1'

/*
 * Meta sandboxes exceeding any of these thresholds are pinned to
 * META_LARGE_SANDBOX_REGION with no fallback and no spillover.
 */
export const META_LARGE_SANDBOX_CPU_CORES = 16
export const META_LARGE_SANDBOX_MEMORY_GB = 16
export const META_LARGE_SANDBOX_DISK_GB = 32
export const RL02_REGION = 'RL02'
export const LARGE_SANDBOX_SHARED_REGION = 'large-sandbox-shared'
export const ELEMENTOR_DEDICATED_REGION = 'elementor-dedicated'
export const RL_REGION = 'RL'
export const EXPERIMENTAL_REGION = 'experimental'

/**
 * Regions where automatic backups and archiving are disabled.
 *
 * Sandboxes in these regions are never backed up and cannot be archived.
 */
export const BACKUP_DISABLED_REGIONS: string[] = [LARGE_SANDBOX_SHARED_REGION, EXPERIMENTAL_REGION]

/**
 * Sandbox classes excluded from the ad-hoc archival paths (user-initiated archive,
 * inactivity auto-archive, and runner-draining archival).
 *
 * These classes are still backed up, and are still archived by the system - but only
 * via the dedicated runner-eviction flow (see evictRunnerSandboxes), never through the
 * usual archival triggers.
 */
export const AUTO_ARCHIVE_EXCLUDED_CLASSES: SandboxClass[] = [SandboxClass.LINUX_VM, SandboxClass.WINDOWS]

/**
 * @returns true if backups and archiving are disabled for the given region
 */
export function isBackupDisabledRegion(region: string): boolean {
  return BACKUP_DISABLED_REGIONS.includes(region)
}

/**
 * @returns true if the given sandbox class is excluded from the ad-hoc archival paths
 * (user, inactivity, draining). Its archival is instead managed by runner eviction.
 */
export function isAutoArchiveExcludedClass(sandboxClass: SandboxClass): boolean {
  return AUTO_ARCHIVE_EXCLUDED_CLASSES.includes(sandboxClass)
}

/**
 * @returns true if users are forbidden from archiving the given sandbox (via the archive
 * endpoint or by setting an autoArchiveInterval), either because of its region or its class.
 *
 * Note: this only governs user-initiated archiving. The system may still archive these
 * sandboxes (e.g. runner eviction). It is intentionally decoupled from whether backups run.
 */
export function forbidUserArchiveCalls(sandbox: { region: string; sandboxClass: SandboxClass }): boolean {
  return isBackupDisabledRegion(sandbox.region) || isAutoArchiveExcludedClass(sandbox.sandboxClass)
}

/**
 * @returns true if the region requires a higher availability score to be considered for runner assignment
 */
export function isHighReliabilityRegion(region: string): boolean {
  switch (region) {
    case WRITER_DEDICATED_US:
    case WRITER_DEDICATED_EU:
      return true
    default:
      return false
  }
}

/*
 * Add here organization IDs that have access to LARGE_SANDBOX_SHARED_REGION
 */
export const LARGE_SANDBOX_ORGS = new Set([
  '9dfa1b82-302b-4b0f-9dfe-f0b435d9647e', // Allie Howe personal org
  'e490abee-8eb7-45be-b0a9-d85800ecdcb5', // cline
  '2f116a7c-d116-45db-9863-faa2ba6171a0', // Finarth.AI
  '287d67b2-f117-49b9-8ae6-50df214ab964', // Gel
  '9f4f4bb5-a521-47a2-9263-462dc409db1d', // fabjan@daytona.io personal org
  '4df7e085-4944-40c7-91e8-5e70664431c0', // Firebender corp
])

const META_LARGE_SANDBOX_SPILLOVER_ORG = '9f4f4bb5-a521-47a2-9263-462dc409db1d'

/*
 * Orgs whose large sandboxes (over the thresholds below) are pinned to
 * META_LARGE_SANDBOX_REGION with no fallback and no spillover.
 */
export const META_LARGE_SANDBOX_ORGS = new Set([
  'fd4f4489-5a9b-4d7b-b62e-dbd26113115c', // Meta
  '683acf39-5b83-49eb-9c43-f8056cec924a', // Drydock
  'bfd70412-3a0f-4973-bd7c-f8234d933dfd', // Meta AAI Labs
  '37424cf2-c171-45a7-9628-e0ccc0f17750', // Meta TBR
  '1fa758b9-6ef2-4ef0-9d2c-6477d4666f07', // Pytorch
  'cbd6042b-5425-4bce-8fad-e5673fded021', // Meta AI Workflows
  'bac16d29-0ad6-49ab-93fa-bb0d9131be56', // Snorkel-AI-Prod
  'aeffef97-aab0-460b-bcb1-75cec66d0a65', // testing
])

export const BUILD_INFO_BLOCKED_ORGS = ['33c1c3f2-fa47-4951-8694-17e1b71083c4', '6e9d049e-d6c3-44ed-abcc-41b6ea478dce']

/*
 * Regions with restricted sandbox creation
 */
export const RESTRICTED_REGIONS = ['RL']

/**
 * Resource-conditional / propagation-only dedicated region mappings that remain in code.
 *
 * Unlike the org routing stored in `region_quota.effective_region_id` (which drives runner
 * assignment for a base region), these mappings are either resource-gated at assignment time
 * (`LARGE_SANDBOX_SHARED_REGION`) or used purely for snapshot propagation. They are merged with
 * the DB-backed routing by `RegionRoutingService.getDedicatedRegionsForOrg`.
 *
 * The key is the organization ID and the value is an array of dedicated regions.
 */
export const CODE_DEDICATED_REGIONS_PER_ORGANIZATION: Record<string, string[]> = (() => {
  const orgRegionMappings = [
    { orgs: [...LARGE_SANDBOX_ORGS], regions: [LARGE_SANDBOX_SHARED_REGION] },
    { orgs: [META_LARGE_SANDBOX_SPILLOVER_ORG], regions: [WRITER_DEDICATED_US] },
  ]

  const result: Record<string, string[]> = {}

  for (const { orgs, regions } of orgRegionMappings) {
    for (const orgId of orgs) {
      if (result[orgId]) {
        result[orgId] = [...new Set([...result[orgId], ...regions])]
      } else {
        result[orgId] = [...regions]
      }
    }
  }

  return result
})()
