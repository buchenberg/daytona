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
  '0fcf06b6-2dc2-4899-8c59-41460e2760ce': ['us-ext-577151'],
  'f48ca04b-3a47-4c81-b626-da44bb888bb1': ['us-ext-777185'],
  'e7395d35-9f0c-40be-8fdb-84165ae48e82': ['us-ext-840021'],

  // INTERNAL TESTING
  '3ae0ced2-f32b-4c06-ba3b-51e5bb22e6e6': ['custom-region-test'],
}
