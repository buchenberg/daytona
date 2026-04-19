/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

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

export type SandboxAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type SnapshotAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type RunnerAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type OrganizationAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type OrganizationUserAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type RegionQuotaAction = 'read' | 'write' | 'write-bulk' | 'delete'
export type UserAction = 'read' | 'delete'
export type AuditLogAction = 'read'

export interface Permissions {
  superAdmin?: boolean
  sandboxes?: SandboxAction[]
  snapshots?: SnapshotAction[]
  runners?: RunnerAction[]
  organizations?: OrganizationAction[]
  organizationUsers?: OrganizationUserAction[]
  regionQuotas?: RegionQuotaAction[]
  users?: UserAction[]
  auditLogs?: AuditLogAction[]
}

export type PermissionResource = Exclude<keyof Permissions, 'superAdmin'>

export type ActionFor<R extends PermissionResource> = NonNullable<Permissions[R]> extends Array<infer A> ? A : never

export type PermissionTuple = {
  [R in PermissionResource]: [R, ActionFor<R>]
}[PermissionResource]

export const ALL_RESOURCES: readonly PermissionResource[] = [
  'sandboxes',
  'snapshots',
  'runners',
  'organizations',
  'organizationUsers',
  'regionQuotas',
  'users',
  'auditLogs',
] as const

export const ACTIONS_BY_RESOURCE: { [R in PermissionResource]: readonly ActionFor<R>[] } = {
  sandboxes: ['read', 'write', 'write-bulk', 'delete'],
  snapshots: ['read', 'write', 'write-bulk', 'delete'],
  runners: ['read', 'write', 'write-bulk', 'delete'],
  organizations: ['read', 'write', 'write-bulk', 'delete'],
  organizationUsers: ['read', 'write', 'write-bulk', 'delete'],
  regionQuotas: ['read', 'write', 'write-bulk', 'delete'],
  users: ['read', 'delete'],
  auditLogs: ['read'],
}
