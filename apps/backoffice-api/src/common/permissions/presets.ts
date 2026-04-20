/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Permissions, ACTIONS_BY_RESOURCE, ALL_RESOURCES, PermissionResource } from './types'

export const SUPER_ADMIN_PERMISSIONS: Permissions = Object.freeze({ superAdmin: true })

export const VIEWER_PERMISSIONS: Permissions = Object.freeze(
  ALL_RESOURCES.reduce((acc, resource) => {
    if ((ACTIONS_BY_RESOURCE[resource] as readonly string[]).includes('read')) {
      Object.assign(acc, { [resource]: Object.freeze(['read']) })
    }
    return acc
  }, {} as Permissions),
)

export const EMPTY_PERMISSIONS: Permissions = Object.freeze({})

export type PermissionPresetName = 'superAdmin' | 'viewer' | 'custom' | 'none'

export function presetFromPermissions(perms: Permissions | null | undefined): PermissionPresetName {
  if (!perms) return 'none'
  if (perms.superAdmin) return 'superAdmin'
  const matchesViewer = ALL_RESOURCES.every((resource: PermissionResource) => {
    const required = ACTIONS_BY_RESOURCE[resource].includes('read' as never) ? ['read'] : []
    const actual = ((perms[resource] as string[] | undefined) ?? []).slice().sort()
    return JSON.stringify(actual) === JSON.stringify(required)
  })
  if (matchesViewer) return 'viewer'
  const anySet = ALL_RESOURCES.some((r) => (perms[r] as string[] | undefined)?.length)
  return anySet ? 'custom' : 'none'
}
