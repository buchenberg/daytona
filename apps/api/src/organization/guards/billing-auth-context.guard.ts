/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, ExecutionContext, Logger } from '@nestjs/common'
import { AuthContextGuard } from '../../common/guards/auth-context.guard'
import { getAuthContext } from '../../common/utils/get-auth-context'
import { isBillingAuthContext } from '../../common/interfaces/billing-auth-context.interface'

/**
 * Validates that the current request is authenticated with a `billing` role auth context.
 */
@Injectable()
export class BillingAuthContextGuard extends AuthContextGuard {
  protected readonly logger = new Logger(BillingAuthContextGuard.name)

  async canActivate(context: ExecutionContext): Promise<boolean> {
    getAuthContext(context, isBillingAuthContext)
    return true
  }
}
