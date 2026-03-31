/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags, ApiExtraModels, ApiSecurity } from '@nestjs/swagger'
import { SearchAuditLogsDto, AuditLogSearchResponseDto, AuditLogResponseDto, AuditLogSearchDataDto } from './dto'
import { AuditService } from './audit.service'
import { FlexibleAuthGuard } from '../common/guards/flexible-auth.guard'

@ApiTags('audit-logs')
@ApiSecurity('bearerAuth')
@Controller('audit-logs')
@UseGuards(FlexibleAuthGuard)
@ApiExtraModels(AuditLogResponseDto, AuditLogSearchDataDto)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post('search')
  @ApiOperation({ summary: 'Search audit logs with filters' })
  @ApiResponse({ status: 200, description: 'List of audit logs', type: AuditLogSearchResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(@Body() dto: SearchAuditLogsDto) {
    return await this.auditService.search(dto)
  }
}
