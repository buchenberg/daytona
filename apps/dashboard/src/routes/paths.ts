/**
 * A single application route.
 *
 * Routes are composed from their parent route and their own segment, so the
 * absolute path and the segment used in nested router definitions always stay
 * in sync.
 */
export interface AppRoute {
  /** Absolute path from the application root, e.g. `/dashboard/keys`. */
  readonly path: string
  /** Path segment relative to the parent route, for nested route definitions. */
  readonly segment: string
}

const route = (parent: AppRoute, segment: string): AppRoute => ({
  path: parent.path === '/' ? `/${segment}` : `${parent.path}/${segment}`,
  segment,
})

const landing: AppRoute = { path: '/', segment: '/' }
const dashboard = route(landing, 'dashboard')
const webhooks = route(dashboard, 'webhooks')

/**
 * The application route tree.
 *
 * Segments are relative to the route's parent in the router configuration:
 * top-level routes are children of the landing route, dashboard pages are
 * children of the dashboard route, and endpoint details are children of the
 * webhooks route.
 */
export const routes = {
  // Main routes
  landing,
  logout: route(landing, 'logout'),
  dashboard,
  docs: route(landing, 'docs'),
  slack: route(landing, 'slack'),

  // Dashboard sub-routes
  keys: route(dashboard, 'keys'),
  secrets: route(dashboard, 'secrets'),
  sandboxes: route(dashboard, 'sandboxes'),
  snapshots: route(dashboard, 'snapshots'),
  registries: route(dashboard, 'registries'),
  volumes: route(dashboard, 'volumes'),
  limits: route(dashboard, 'limits'),
  billingSpending: route(dashboard, 'billing/spending'),
  billingWallet: route(dashboard, 'billing/wallet'),
  members: route(dashboard, 'members'),
  roles: route(dashboard, 'roles'),
  settings: route(dashboard, 'settings'),
  onboarding: route(dashboard, 'onboarding'),
  auditLogs: route(dashboard, 'audit-logs'),
  regions: route(dashboard, 'regions'),
  runners: route(dashboard, 'runners'),
  playground: route(dashboard, 'playground'),

  // User routes
  userInvitations: route(dashboard, 'user/invitations'),
  accountSettings: route(dashboard, 'user/account-settings'),

  // Webhooks
  webhooks,
  webhookEndpointDetails: route(webhooks, ':endpointId'),

  // Sandboxes
  sandboxDetails: route(dashboard, 'sandboxes/:sandboxId'),

  // Email verification
  emailVerify: route(dashboard, 'organization/:organizationId/verify-email/:email/:token'),
} as const
