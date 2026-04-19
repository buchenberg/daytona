/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Permissions, ACTIONS_BY_RESOURCE, ALL_RESOURCES, PermissionResource } from './types'

export const SUPER_ADMIN_PERMISSIONS: Permissions = { superAdmin: true }

export const VIEWER_PERMISSIONS: Permissions = ALL_RESOURCES.reduce((acc, resource) => {
  const actions = ACTIONS_BY_RESOURCE[resource]
  const readable = (actions as readonly string[]).includes('read') ? ['read'] : []
  if (readable.length > 0) (acc as any)[resource] = readable
  return acc
}, {} as Permissions)

export const EMPTY_PERMISSIONS: Permissions = {}

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
