/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { BillingService } from './services/billing.service'

@Module({
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
