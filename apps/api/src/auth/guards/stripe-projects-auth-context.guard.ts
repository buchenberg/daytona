/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, ExecutionContext, Logger } from '@nestjs/common'
import { AuthContextGuard } from '../../common/guards/auth-context.guard'
import { getAuthContext } from '../../common/utils/get-auth-context'
import { isStripeProjectsAuthContext } from '../../common/interfaces/stripe-projects-auth-context.interface'

@Injectable()
export class StripeProjectsAuthContextGuard extends AuthContextGuard {
  protected readonly logger = new Logger(StripeProjectsAuthContextGuard.name)

  async canActivate(context: ExecutionContext): Promise<boolean> {
    getAuthContext(context, isStripeProjectsAuthContext)
    return true
  }
}
