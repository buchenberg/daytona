/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RequirePermission, RequiredPermission } from '../decorators/require-permission.decorator'
import { hasAnyPermission } from '../permissions'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const value = this.reflector.getAllAndOverride(RequirePermission, [context.getHandler(), context.getClass()])

    // No @RequirePermission → just an authenticated user is enough
    if (!value) {
      return true
    }

    const required: RequiredPermission[] = Array.isArray(value[0])
      ? (value as RequiredPermission[])
      : [value as RequiredPermission]

    const request = context.switchToHttp().getRequest()
    if (!hasAnyPermission(request.user?.permissions, required)) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'AUTH_008',
          message: 'Insufficient permissions',
        },
      })
    }

    return true
  }
}
