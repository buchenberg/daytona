/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Roles } from '../decorators/roles.decorator'
import { BackofficeRole } from '../enums/backoffice-role.enum'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<BackofficeRole[]>(Roles, [context.getHandler(), context.getClass()])

    if (!roles || roles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const userRole = request.user?.role

    if (!userRole || !roles.includes(userRole)) {
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
