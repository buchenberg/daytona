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
  'ebe1abc6-dc31-4b49-8f4f-953b096ecf40': ['us-ext-sandbox'],

  // INTERNAL TESTING
  '3ae0ced2-f32b-4c06-ba3b-51e5bb22e6e6': ['custom-region-test'],
}
