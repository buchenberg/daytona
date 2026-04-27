/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, ExecutionContext, Logger } from '@nestjs/common'
import { AuthContextGuard } from '../../common/guards/auth-context.guard'
import { getAuthContext } from '../../common/utils/get-auth-context'
import { isUserManagementAuthContext } from '../../common/interfaces/user-management-auth-context.interface'

@Injectable()
export class UserManagementAuthContextGuard extends AuthContextGuard {
  protected readonly logger = new Logger(UserManagementAuthContextGuard.name)

  async canActivate(context: ExecutionContext): Promise<boolean> {
    getAuthContext(context, isUserManagementAuthContext)
    return true
  }
}
