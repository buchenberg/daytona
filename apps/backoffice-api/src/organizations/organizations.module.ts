/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HttpModule } from '@nestjs/axios'
import { Organization } from '@api/organization/entities/organization.entity'
import { OrganizationsController, OrganizationsBulkController, OrganizationsSearchController } from './controllers'
import { OrganizationsService, OrganizationsBulkService, OrganizationsSearchService } from './services'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TypeOrmModule.forFeature([Organization]), HttpModule, AuthModule],
  controllers: [OrganizationsController, OrganizationsBulkController, OrganizationsSearchController],
  providers: [OrganizationsService, OrganizationsBulkService, OrganizationsSearchService],
  exports: [OrganizationsService, OrganizationsBulkService, OrganizationsSearchService],
})
export class OrganizationsModule {}
