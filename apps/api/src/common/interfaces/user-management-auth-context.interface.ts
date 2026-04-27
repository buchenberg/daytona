/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface UserManagementAuthContext extends BaseAuthContext {
  role: 'user-management'
}

export function isUserManagementAuthContext(user: unknown): user is UserManagementAuthContext {
  return isBaseAuthContext(user) && user.role === 'user-management'
}
