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
import { SnapshotsBulkService } from '../services'
import { BulkUpdateSnapshotDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('snapshots')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('snapshots')
export class SnapshotsBulkController {
  constructor(private readonly snapshotsBulkService: SnapshotsBulkService) {}

  @Post('bulk-update')
  @RequirePermission(['snapshots', 'write-bulk'])
  @ApiOperation({ summary: 'Bulk update snapshots' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.SNAPSHOT,
    targetIdsFromRequest: (req) => req.body?.ids,
  })
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateSnapshotDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkUpdateResponseDto> {
    const userId = req.user?.id || 'unknown'
    return this.snapshotsBulkService.bulkUpdate(bulkUpdateDto, userId)
  }
}
