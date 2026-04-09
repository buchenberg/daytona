/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface RunnerCleanupToolAuthContext extends BaseAuthContext {
  role: 'runner-cleanup-tool'
}

export function isRunnerCleanupToolAuthContext(user: unknown): user is RunnerCleanupToolAuthContext {
  return isBaseAuthContext(user) && user.role === 'runner-cleanup-tool'
}
