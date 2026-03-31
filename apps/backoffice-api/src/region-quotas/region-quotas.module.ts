/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { RegionQuotasController, RegionQuotasBulkController, RegionQuotasSearchController } from './controllers'
import { RegionQuotasService, RegionQuotasBulkService, RegionQuotasSearchService } from './services'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TypeOrmModule.forFeature([RegionQuota]), AuthModule],
  controllers: [RegionQuotasController, RegionQuotasBulkController, RegionQuotasSearchController],
  providers: [RegionQuotasService, RegionQuotasBulkService, RegionQuotasSearchService],
  exports: [RegionQuotasService, RegionQuotasBulkService, RegionQuotasSearchService],
})
export class RegionQuotasModule {}
