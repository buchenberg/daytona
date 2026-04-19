/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Reflector } from '@nestjs/core'
import { PermissionResource, ActionFor } from '../permissions'

export type RequiredPermission = { [R in PermissionResource]: readonly [R, ActionFor<R>] }[PermissionResource]

/**
 * Mark an endpoint (or a whole controller) with one or more permissions the
 * caller needs. When an array of tuples is provided they are treated as OR —
 * having any of them allows access. A `superAdmin: true` user always passes.
 *
 * Evaluated by `PermissionsGuard`.
 *
 *   @RequirePermission(['sandboxes', 'write'])
 *   @RequirePermission([['sandboxes', 'write'], ['sandboxes', 'write-bulk']])
 */
export const RequirePermission = Reflector.createDecorator<RequiredPermission | RequiredPermission[]>()
