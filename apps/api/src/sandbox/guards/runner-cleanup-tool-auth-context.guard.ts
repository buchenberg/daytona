/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, ExecutionContext, Logger } from '@nestjs/common'
import { AuthContextGuard } from '../../common/guards/auth-context.guard'
import { getAuthContext } from '../../common/utils/get-auth-context'
import { isRunnerCleanupToolAuthContext } from '../../common/interfaces/runner-cleanup-tool-auth-context.interface'

/**
 * Validates that the current request is authenticated with a `runner-cleanup-tool` role auth context.
 */
@Injectable()
export class RunnerCleanupToolAuthContextGuard extends AuthContextGuard {
  protected readonly logger = new Logger(RunnerCleanupToolAuthContextGuard.name)

  async canActivate(context: ExecutionContext): Promise<boolean> {
    getAuthContext(context, isRunnerCleanupToolAuthContext)
    return true
  }
}
