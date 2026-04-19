/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiExtraModels } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { OrganizationsSearchService } from '../services'
import { SearchOrganizationDto, OrganizationSearchResponseDto, OrganizationResponseDto } from '../dto'

@ApiTags('organizations')
@ApiSecurity('bearerAuth')
@ApiExtraModels(OrganizationResponseDto)
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsSearchController {
  constructor(private readonly organizationsSearchService: OrganizationsSearchService) {}

  @Post('search')
  @RequirePermission(['organizations', 'read'])
  @ApiOperation({ summary: 'Search organizations' })
  @ApiResponse({ status: 200, description: 'Organizations search results', type: OrganizationSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async search(@Body() searchDto: SearchOrganizationDto) {
    return await this.organizationsSearchService.search(searchDto)
  }
}
