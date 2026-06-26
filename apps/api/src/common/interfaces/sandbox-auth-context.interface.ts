/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface SandboxAuthContext extends BaseAuthContext {
  role: 'sandbox'
  sandboxId: string
  organizationId: string
}

export function isSandboxAuthContext(user: unknown): user is SandboxAuthContext {
  return isBaseAuthContext(user) && user.role === 'sandbox'
}
