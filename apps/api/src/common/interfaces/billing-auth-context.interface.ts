/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface BillingAuthContext extends BaseAuthContext {
  role: 'billing'
}

export function isBillingAuthContext(user: unknown): user is BillingAuthContext {
  return isBaseAuthContext(user) && user.role === 'billing'
}
