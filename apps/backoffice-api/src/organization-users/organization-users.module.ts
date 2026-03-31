/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { Organization } from '@api/organization/entities/organization.entity'
import { OrganizationRole } from '@api/organization/entities/organization-role.entity'
import { OrganizationInvitation } from '@api/organization/entities/organization-invitation.entity'
import { User } from '@api/user/user.entity'
import {
  OrganizationUsersController,
  OrganizationUsersBulkController,
  OrganizationUsersSearchController,
} from './controllers'
import { OrganizationUsersService, OrganizationUsersBulkService, OrganizationUsersSearchService } from './services'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationUser, Organization, OrganizationRole, OrganizationInvitation, User]),
    AuthModule,
  ],
  controllers: [OrganizationUsersController, OrganizationUsersBulkController, OrganizationUsersSearchController],
  providers: [OrganizationUsersService, OrganizationUsersBulkService, OrganizationUsersSearchService],
  exports: [OrganizationUsersService, OrganizationUsersBulkService, OrganizationUsersSearchService],
})
export class OrganizationUsersModule {}
