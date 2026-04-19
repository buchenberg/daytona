/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiExtraModels } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { OrganizationUsersSearchService } from '../services'
import { SearchOrganizationUserDto, OrganizationUserSearchResponseDto, OrganizationUserResponseDto } from '../dto'

@ApiTags('organization-users')
@ApiSecurity('bearerAuth')
@ApiExtraModels(OrganizationUserResponseDto)
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('organization-users')
export class OrganizationUsersSearchController {
  constructor(private readonly organizationUsersSearchService: OrganizationUsersSearchService) {}

  @Post('search')
  @RequirePermission(['organizationUsers', 'read'])
  @ApiOperation({ summary: 'Search organization-users' })
  @ApiResponse({ status: 200, description: 'Search results', type: OrganizationUserSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async search(@Body() searchDto: SearchOrganizationUserDto) {
    return await this.organizationUsersSearchService.search(searchDto)
  }
}
