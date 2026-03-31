/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Reflector } from '@nestjs/core'
import { BackofficeRole } from '../enums/backoffice-role.enum'

export const Roles = Reflector.createDecorator<BackofficeRole[]>()
