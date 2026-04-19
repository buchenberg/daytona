/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiExtraModels } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { RunnersSearchService } from '../services'
import { SearchRunnerDto, RunnerSearchResponseDto, RunnerResponseDto } from '../dto'

@ApiTags('runners')
@ApiSecurity('bearerAuth')
@ApiExtraModels(RunnerResponseDto)
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('runners')
export class RunnersSearchController {
  constructor(private readonly runnersSearchService: RunnersSearchService) {}

  @Post('search')
  @RequirePermission(['runners', 'read'])
  @ApiOperation({ summary: 'Search runners' })
  @ApiResponse({ status: 200, description: 'Search results', type: RunnerSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async search(@Body() searchDto: SearchRunnerDto) {
    return await this.runnersSearchService.search(searchDto)
  }
}
