import { TypedConfigService } from '../../config/typed-config.service'
import { areResourcesLargerThanDefault, Resources } from '../utils/resources'

/*
 * Dedicated regions for runner assignment
 */
const WRITER_DEDICATED_US = 'writer-dedicated-us'
const WRITER_DEDICATED_EU = 'writer-dedicated-eu'
export const LARGE_SANDBOX_SHARED_REGION = 'large-sandbox-shared'

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

/**
 * @returns true if the region is a dedicated region that can fallback to a base region
 */
export const hasFallbackRegion = (region: string): boolean => {
  switch (region) {
    case WRITER_DEDICATED_US:
    case WRITER_DEDICATED_EU:
      return true
    default:
      return false
  }
}

/**
 * @returns the fallback region for the given region, or null if no fallback is available
 */
export function getFallbackRegion(region: string): string | null {
  switch (region) {
    case WRITER_DEDICATED_US:
      return 'us'
    case WRITER_DEDICATED_EU:
      return 'eu'
    default:
      return null
  }
}

export function getFallbackRegions(regions: string[]): string[] {
  return regions.map((region) => getFallbackRegion(region)).filter((region) => region !== null)
}

/*
 * Add here organization IDs that have access to LARGE_SANDBOX_SHARED_REGION
 */
export const LARGE_SANDBOX_ORGS = new Set([
  '9dfa1b82-302b-4b0f-9dfe-f0b435d9647e', // Allie Howe personal org
  'e490abee-8eb7-45be-b0a9-d85800ecdcb5', // cline
  '50071d40-742e-4d9d-be5c-b857493148f7', // idler
  '2f116a7c-d116-45db-9863-faa2ba6171a0', // Finarth.AI
  '287d67b2-f117-49b9-8ae6-50df214ab964', // Gel
  '9f4f4bb5-a521-47a2-9263-462dc409db1d', // fabjan@daytona.io personal org
])

/*
 * Add here organization IDs that have access to WRITER_DEDICATED_US and WRITER_DEDICATED_EU
 */
export const WRITER_ORGS = [
  'ebe1abc6-dc31-4b49-8f4f-953b096ecf40',
  '0fcf06b6-2dc2-4899-8c59-41460e2760ce',
  'f48ca04b-3a47-4c81-b626-da44bb888bb1',
  'e7395d35-9f0c-40be-8fdb-84165ae48e82',
  'b85fe86a-db98-46d8-850b-77166ee6d97b',
  'f74e75e9-47ad-4d5d-bc10-f0f5994f7117',
  'a6d3672e-4fab-4117-bcbb-913dba768d75',
  '2ca4611c-c53f-4669-88ce-376a1d4ffe2a',
  '815f0cf1-037d-4514-a7ec-2251b0b33596',
  '6780b872-df13-44b6-bc6a-59c56ca469c3',
  'd3df4094-226d-400b-804a-e4f9aa5a60d0',
]

/**
 * Add here organization IDs of Daytona engineers for testing purposes
 */
const DAYTONA_MEMBERS_ORGS = [
  '3ae0ced2-f32b-4c06-ba3b-51e5bb22e6e6', // Internal Testing
  'bf29e0f2-5fa9-48db-b80c-c7fae9c4e29c', // Breja
  '1db02bc5-acae-447b-b6ad-f5fa323d3cf6', // Toma
  '99c32bbf-0ba0-4980-af71-22f50376032e', // Mirko
]

/**
 * Used for snapshot propagation to dedicated regions created by Daytona.
 *
 * The customers are unaware of these regions. They are only used for runner assignment.
 *
 * The key is the organization ID and the value is an array of dedicated regions.
 */
export const DEDICATED_REGIONS_PER_ORGANIZATION: Record<string, string[]> = (() => {
  const orgRegionMappings = [
    { orgs: WRITER_ORGS, regions: [WRITER_DEDICATED_US, WRITER_DEDICATED_EU] },
    { orgs: LARGE_SANDBOX_ORGS, regions: [LARGE_SANDBOX_SHARED_REGION] },
  ]

  // orgId -> regions
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

/**
 * @param organizationId
 * @param baseRegionId - ID of the region chosen for sandbox creation or snapshot propagation
 * @param configService
 * @param resources
 * @returns The dedicated region if applicable, otherwise the base region.
 */
export function resolveEffectiveRegion(
  organizationId: string,
  baseRegionId: string,
  configService: TypedConfigService,
  resources: Resources,
) {
  // if (DAYTONA_MEMBERS_ORGS.includes(organizationId)) {
  if (WRITER_ORGS.includes(organizationId)) {
    if (baseRegionId === 'us') {
      return WRITER_DEDICATED_US
    } else if (baseRegionId === 'eu') {
      return WRITER_DEDICATED_EU
    }
  }

  if (LARGE_SANDBOX_ORGS.has(organizationId)) {
    if (areResourcesLargerThanDefault(configService, resources)) {
      return LARGE_SANDBOX_SHARED_REGION
    }
  }

  return baseRegionId
}
