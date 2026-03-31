/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiExtraModels } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { RegionQuotasSearchService } from '../services'
import { SearchRegionQuotaDto, RegionQuotaSearchResponseDto, RegionQuotaResponseDto } from '../dto'

@ApiTags('region-quotas')
@ApiSecurity('bearerAuth')
@ApiExtraModels(RegionQuotaResponseDto)
@UseGuards(FlexibleAuthGuard)
@Controller('region-quotas')
export class RegionQuotasSearchController {
  constructor(private readonly regionQuotasSearchService: RegionQuotasSearchService) {}

  @Post('search')
  @ApiOperation({ summary: 'Search region-quotas' })
  @ApiResponse({ status: 200, description: 'Search results', type: RegionQuotaSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async search(@Body() searchDto: SearchRegionQuotaDto) {
    return await this.regionQuotasSearchService.search(searchDto)
  }
}
