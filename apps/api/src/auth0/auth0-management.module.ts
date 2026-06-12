/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { Auth0ManagementService } from './auth0-management.service'

@Module({
  providers: [Auth0ManagementService],
  exports: [Auth0ManagementService],
})
export class Auth0ManagementModule {}
