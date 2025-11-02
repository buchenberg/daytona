const WRITER_DEDICATED_US = 'writer-dedicated-us'
const WRITER_DEDICATED_EU = 'writer-dedicated-eu'

export const KEPLER_DEDICATED_REGULAR = 'kepler-dedicated-regular'
export const KEPLER_DEDICATED_LARGE = 'kepler-dedicated-large'
/**
 * List of custom regions per organization.
 *
 * The key is the organization ID and the value is an array of custom regions.
 */
export const CUSTOM_REGIONS_PER_ORGANIZATION: Record<string, string[]> = {
  // CODEANYWHERE
  '26a8fb68-6fb1-4429-b766-5df6795a5ab0': ['codeany', 'codeany-free'],
  // BROWSER USE
  '9187b39a-b22a-4207-be3b-c67b42ae10d0': ['browser-use'],
  // WRITER
  'ebe1abc6-dc31-4b49-8f4f-953b096ecf40': ['us-ext-sandbox', WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  '0fcf06b6-2dc2-4899-8c59-41460e2760ce': ['us-ext-577151', WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  'f48ca04b-3a47-4c81-b626-da44bb888bb1': ['us-ext-777185', WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  'e7395d35-9f0c-40be-8fdb-84165ae48e82': ['us-ext-840021', WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  'b85fe86a-db98-46d8-850b-77166ee6d97b': [WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  'f74e75e9-47ad-4d5d-bc10-f0f5994f7117': [WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  'a6d3672e-4fab-4117-bcbb-913dba768d75': [WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  '2ca4611c-c53f-4669-88ce-376a1d4ffe2a': [WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  '815f0cf1-037d-4514-a7ec-2251b0b33596': [WRITER_DEDICATED_US, WRITER_DEDICATED_EU],
  '6780b872-df13-44b6-bc6a-59c56ca469c3': [WRITER_DEDICATED_US, WRITER_DEDICATED_EU],

  // Writer-production
  'd3df4094-226d-400b-804a-e4f9aa5a60d0': [WRITER_DEDICATED_US, WRITER_DEDICATED_EU],

  // Kepler
  '83e127af-2de9-4549-903c-b7bf907ecb58': [KEPLER_DEDICATED_REGULAR, KEPLER_DEDICATED_LARGE],

  // INTERNAL TESTING
  '3ae0ced2-f32b-4c06-ba3b-51e5bb22e6e6': ['custom-region-test'],

  // Breja
  'bf29e0f2-5fa9-48db-b80c-c7fae9c4e29c': ['custom-region-test'],
  // Toma
  '1db02bc5-acae-447b-b6ad-f5fa323d3cf6': ['custom-region-test'],
  // Mirko
  '99c32bbf-0ba0-4980-af71-22f50376032e': ['custom-region-test'],
}

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

export const KEPLER_ORG_ID = '83e127af-2de9-4549-903c-b7bf907ecb58'

const DAYTONA_MEMBERS_ORGS = [
  '3ae0ced2-f32b-4c06-ba3b-51e5bb22e6e6', // Internal Testing
  'bf29e0f2-5fa9-48db-b80c-c7fae9c4e29c', // Breja
  '1db02bc5-acae-447b-b6ad-f5fa323d3cf6', // Toma
  '99c32bbf-0ba0-4980-af71-22f50376032e', // Mirko
]

export function getDedicatedRegion(organizationId: string, baseRegion: string) {
  // if (DAYTONA_MEMBERS_ORGS.includes(organizationId)) {
  if (WRITER_ORGS.includes(organizationId)) {
    if (baseRegion === 'us') {
      return WRITER_DEDICATED_US
    } else if (baseRegion === 'eu') {
      return WRITER_DEDICATED_EU
    }
  }

  return baseRegion
}

export function isDedicatedRegion(region: string) {
  switch (region) {
    case WRITER_DEDICATED_US:
    case WRITER_DEDICATED_EU:
      return true
    default:
      return false
  }
}

export function getFallbackRegion(region: string) {
  switch (region) {
    case WRITER_DEDICATED_US:
      return 'us'
    case WRITER_DEDICATED_EU:
      return 'eu'
    default:
      return region
  }
}
