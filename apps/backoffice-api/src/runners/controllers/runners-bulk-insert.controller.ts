/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { RunnersBulkInsertService } from '../services'
import { BulkInsertRunnerDto, BulkInsertResponseDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('runners')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('runners')
export class RunnersBulkInsertController {
  constructor(private readonly runnersBulkInsertService: RunnersBulkInsertService) {}

  @Post('bulk-insert')
  @RequirePermission(['runners', 'write-bulk'])
  @ApiOperation({ summary: 'Bulk insert runners' })
  @ApiResponse({ status: 200, description: 'Bulk insert completed', type: BulkInsertResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Audit({
    action: AuditAction.BULK_INSERT,
    targetType: AuditTarget.RUNNER,
    targetIdsFromResult: (result) =>
      result?.results?.filter((r: any) => r.success && r.data?.id).map((r: any) => r.data.id),
  })
  async bulkInsert(@Body() dto: BulkInsertRunnerDto, @Req() req: AuthenticatedRequest): Promise<BulkInsertResponseDto> {
    const userId = req.user?.id || 'unknown'
    return this.runnersBulkInsertService.bulkInsert(dto, userId)
  }
}
