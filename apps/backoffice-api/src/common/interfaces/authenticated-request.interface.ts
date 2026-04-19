/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Request } from 'express'
import { Permissions } from '../permissions'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    name?: string
    permissions: Permissions
  }
}
