/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { Organization } from '@api/organization/entities/organization.entity'
import { Region } from '@api/region/entities/region.entity'
import { QuotaBumpRequest } from '../backoffice-db/entities/quota-bump-request.entity'
import {
  RegionQuotasController,
  RegionQuotasBulkController,
  RegionQuotasSearchController,
  QuotaBumpsController,
} from './controllers'
import {
  RegionQuotasService,
  RegionQuotasBulkService,
  RegionQuotasSearchService,
  QuotaBumpService,
  QuotaBumpExpiryService,
} from './services'
import { AuthModule } from '../auth/auth.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([RegionQuota, Organization, Region]),
    TypeOrmModule.forFeature([QuotaBumpRequest], 'backoffice'),
    AuthModule,
    AuditModule,
  ],
  controllers: [RegionQuotasController, RegionQuotasBulkController, RegionQuotasSearchController, QuotaBumpsController],
  providers: [
    RegionQuotasService,
    RegionQuotasBulkService,
    RegionQuotasSearchService,
    QuotaBumpService,
    QuotaBumpExpiryService,
  ],
  exports: [RegionQuotasService, RegionQuotasBulkService, RegionQuotasSearchService, QuotaBumpService],
})
export class RegionQuotasModule {}
