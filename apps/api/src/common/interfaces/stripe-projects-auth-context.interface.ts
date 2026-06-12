/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface StripeProjectsAuthContext extends BaseAuthContext {
  role: 'stripe-projects'
}

export function isStripeProjectsAuthContext(user: unknown): user is StripeProjectsAuthContext {
  return isBaseAuthContext(user) && user.role === 'stripe-projects'
}
