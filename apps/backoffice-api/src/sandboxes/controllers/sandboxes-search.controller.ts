/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiExtraModels } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { SandboxesSearchService } from '../services'
import { SearchSandboxDto, SandboxSearchResponseDto, SandboxResponseDto } from '../dto'

@ApiTags('sandboxes')
@ApiSecurity('bearerAuth')
@ApiExtraModels(SandboxResponseDto)
@UseGuards(FlexibleAuthGuard)
@Controller('sandboxes')
export class SandboxesSearchController {
  constructor(private readonly sandboxesSearchService: SandboxesSearchService) {}

  @Post('search')
  @ApiOperation({ summary: 'Search sandboxes' })
  @ApiResponse({ status: 200, description: 'Search results', type: SandboxSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async search(@Body() searchDto: SearchSandboxDto) {
    return await this.sandboxesSearchService.search(searchDto)
  }
}
