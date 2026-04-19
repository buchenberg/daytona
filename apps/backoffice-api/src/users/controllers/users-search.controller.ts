/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags, ApiExtraModels, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { UsersSearchService } from '../services/users-search.service'
import { SearchUsersDto } from '../dto/search-users.dto'
import { UserSearchResponseDto, UserResponseDto, UserSearchDataDto } from '../dto/user-search-response.dto'

@ApiTags('users')
@ApiSecurity('bearerAuth')
@Controller('users')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@ApiExtraModels(UserResponseDto, UserSearchDataDto)
export class UsersSearchController {
  constructor(private readonly usersSearchService: UsersSearchService) {}

  @Post('search')
  @RequirePermission(['users', 'read'])
  @ApiOperation({ summary: 'Search users' })
  @ApiResponse({ status: 200, description: 'Search results', type: UserSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(@Body() searchDto: SearchUsersDto) {
    return await this.usersSearchService.search(searchDto)
  }
}
