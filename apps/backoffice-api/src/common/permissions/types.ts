/**
 * Fine-grained RBAC permissions for the backoffice.
 *
 * Shape (industry practice — see AWS IAM, Stripe, GCP):
 *   - a map of `resource → allowed actions[]`
 *   - an optional `superAdmin` bypass that grants everything
 *   - absence of a resource / action ⇒ denied (least privilege)
 *
 * Action strings are kebab-case (matches this codebase's URL conventions:
 * `bulk-update`, `add-to-warm-pool`, `initialize-webhooks`), so a permission
 * can be read as `resource:action` — e.g. `sandboxes:write-bulk`.
 *
 * The `Permissions` value is stored verbatim as a JSONB column on
 * `backoffice_user.permissions` and is also embedded in the session JWT,
 * so it must stay small and JSON-serializable (no classes, no Dates).
 */

export type SandboxAction = 'read' | 'write' | 'write-bulk' | 'delete' | 'resync'
export type SnapshotAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type RunnerAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type FleetAction = 'read' | 'write'
export type OrganizationAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type OrganizationUserAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type RegionQuotaAction = 'read' | 'write' | 'write-bulk' | 'delete' | 'request'
export type UserAction = 'read' | 'delete'
export type AuditLogAction = 'read'
// For Mali the grantable "actions" are datasources rather than CRUD verbs:
// `maliDatasources: ['grafana']` reads as "may invoke Grafana tools". This
// keeps datasource grants flowing through the same resource→actions machinery
// (guards, DTOs, wildcard checks) as everything else.
export type MaliDatasource = 'database' | 'clickhouse' | 'grafana' | 'opensearch' | 'posthog' | 'sandbox'

export interface Permissions {
  superAdmin?: boolean
  sandboxes?: SandboxAction[]
  snapshots?: SnapshotAction[]
  runners?: RunnerAction[]
  fleet?: FleetAction[]
  organizations?: OrganizationAction[]
  organizationUsers?: OrganizationUserAction[]
  regionQuotas?: RegionQuotaAction[]
  users?: UserAction[]
  auditLogs?: AuditLogAction[]
  maliDatasources?: MaliDatasource[]
}

export type PermissionResource = Exclude<keyof Permissions, 'superAdmin'>

export type ActionFor<R extends PermissionResource> = NonNullable<Permissions[R]> extends Array<infer A> ? A : never

// Wildcard used in permission *requirements* (decorators / helpers) to mean
// "any action on this resource is sufficient". Inspired by IAM-style `*`
// policies. Stored `Permissions` values never contain '*'.
export type WildcardAction = '*'

export type PermissionTuple = {
  [R in PermissionResource]: [R, ActionFor<R>]
}[PermissionResource]

export const ALL_RESOURCES: readonly PermissionResource[] = [
  'sandboxes',
  'snapshots',
  'runners',
  'fleet',
  'organizations',
  'organizationUsers',
  'regionQuotas',
  'users',
  'auditLogs',
  'maliDatasources',
] as const

export const ACTIONS_BY_RESOURCE: { [R in PermissionResource]: readonly ActionFor<R>[] } = {
  sandboxes: ['read', 'write', 'write-bulk', 'delete', 'resync'],
  snapshots: ['read', 'write', 'write-bulk', 'delete'],
  runners: ['read', 'write', 'write-bulk', 'delete'],
  fleet: ['read', 'write'],
  organizations: ['read', 'write', 'write-bulk', 'delete'],
  organizationUsers: ['read', 'write', 'write-bulk', 'delete'],
  regionQuotas: ['read', 'write', 'write-bulk', 'delete', 'request'],
  users: ['read', 'delete'],
  auditLogs: ['read'],
  maliDatasources: ['database', 'clickhouse', 'grafana', 'opensearch', 'posthog', 'sandbox'],
}
