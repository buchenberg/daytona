/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiExtraModels } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { SnapshotsSearchService } from '../services'
import { SearchSnapshotDto, SnapshotSearchResponseDto, SnapshotResponseDto } from '../dto'

@ApiTags('snapshots')
@ApiSecurity('bearerAuth')
@ApiExtraModels(SnapshotResponseDto)
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('snapshots')
export class SnapshotsSearchController {
  constructor(private readonly snapshotsSearchService: SnapshotsSearchService) {}

  @Post('search')
  @RequirePermission(['snapshots', 'read'])
  @ApiOperation({ summary: 'Search snapshots' })
  @ApiResponse({ status: 200, description: 'Search results', type: SnapshotSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async search(@Body() searchDto: SearchSnapshotDto) {
    return await this.snapshotsSearchService.search(searchDto)
  }
}
