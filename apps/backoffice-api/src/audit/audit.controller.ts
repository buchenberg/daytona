/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags, ApiExtraModels, ApiSecurity } from '@nestjs/swagger'
import { SearchAuditLogsDto, AuditLogSearchResponseDto, AuditLogResponseDto, AuditLogSearchDataDto } from './dto'
import { AuditService } from './audit.service'
import { FlexibleAuthGuard } from '../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../common/guards/permissions.guard'
import { RequirePermission } from '../common/decorators/require-permission.decorator'

@ApiTags('audit-logs')
@ApiSecurity('bearerAuth')
@Controller('audit-logs')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@ApiExtraModels(AuditLogResponseDto, AuditLogSearchDataDto)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post('search')
  @RequirePermission(['auditLogs', 'read'])
  @ApiOperation({ summary: 'Search audit logs with filters' })
  @ApiResponse({ status: 200, description: 'List of audit logs', type: AuditLogSearchResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(@Body() dto: SearchAuditLogsDto) {
    return await this.auditService.search(dto)
  }
}
