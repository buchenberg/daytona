/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Reflector } from '@nestjs/core'
import { PermissionResource, ActionFor, WildcardAction } from '../permissions'

export type RequiredPermission = {
  [R in PermissionResource]: readonly [R, ActionFor<R> | WildcardAction]
}[PermissionResource]

/**
 * Mark an endpoint (or a whole controller) with one or more permissions the
 * caller needs. When an array of tuples is provided they are treated as OR —
 * having any of them allows access. A `superAdmin: true` user always passes.
 *
 * Pass `'*'` as the action to require "any action on this resource" (IAM-style
 * wildcard). Evaluated by `PermissionsGuard`.
 *
 *   @RequirePermission(['sandboxes', 'write'])
 *   @RequirePermission([['sandboxes', 'write'], ['sandboxes', 'write-bulk']])
 *   @RequirePermission(['maliDatasources', '*'])
 */
export const RequirePermission = Reflector.createDecorator<RequiredPermission | RequiredPermission[]>()
