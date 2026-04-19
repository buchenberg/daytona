/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Permissions, PermissionResource, ActionFor } from './types'

export function hasPermission<R extends PermissionResource>(
  perms: Permissions | null | undefined,
  resource: R,
  action: ActionFor<R>,
): boolean {
  if (!perms) return false
  if (perms.superAdmin === true) return true
  const allowed = perms[resource] as readonly string[] | undefined
  return !!allowed && allowed.includes(action as string)
}

export function hasAnyPermission(
  perms: Permissions | null | undefined,
  required: ReadonlyArray<readonly [PermissionResource, string]>,
): boolean {
  if (!perms) return false
  if (perms.superAdmin === true) return true
  return required.some(([resource, action]) => {
    const allowed = perms[resource] as readonly string[] | undefined
    return !!allowed && allowed.includes(action)
  })
}

export function isSuperAdmin(perms: Permissions | null | undefined): boolean {
  return perms?.superAdmin === true
}
