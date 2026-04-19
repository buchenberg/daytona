/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common'
import { BulkUpdateResponseDto } from '../../common/dto/bulk-response.dto'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { RunnersBulkService } from '../services'
import { BulkUpdateRunnerDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('runners')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('runners')
export class RunnersBulkController {
  constructor(private readonly runnersBulkService: RunnersBulkService) {}

  @Post('bulk-update')
  @RequirePermission(['runners', 'write-bulk'])
  @ApiOperation({ summary: 'Bulk update runners' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.RUNNER,
    targetIdsFromRequest: (req) => req.body?.ids,
  })
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateRunnerDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkUpdateResponseDto> {
    const userId = req.user?.id || 'unknown'
    return this.runnersBulkService.bulkUpdate(bulkUpdateDto, userId)
  }
}
