/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Request } from 'express'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    name?: string
    role: string
  }
}
