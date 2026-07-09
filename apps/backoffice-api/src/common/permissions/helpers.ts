/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Permissions, PermissionResource, ActionFor, WildcardAction } from './types'

export function hasPermission<R extends PermissionResource>(
  perms: Permissions | null | undefined,
  resource: R,
  action: ActionFor<R> | WildcardAction,
): boolean {
  if (!perms) return false
  if (perms.superAdmin === true) return true
  const allowed = perms[resource] as readonly string[] | undefined
  if (!allowed || allowed.length === 0) return false
  if (action === '*') return true
  return allowed.includes(action as string)
}

export function hasAnyPermission(
  perms: Permissions | null | undefined,
  required: ReadonlyArray<readonly [PermissionResource, string]>,
): boolean {
  return required.some(([resource, action]) =>
    hasPermission(perms, resource, action as ActionFor<PermissionResource> | WildcardAction),
  )
}

export function isSuperAdmin(perms: Permissions | null | undefined): boolean {
  return perms?.superAdmin === true
}
