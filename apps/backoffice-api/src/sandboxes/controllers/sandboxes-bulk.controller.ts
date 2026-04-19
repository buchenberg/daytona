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
import { SandboxesBulkService } from '../services'
import { BulkUpdateSandboxDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('sandboxes')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('sandboxes')
export class SandboxesBulkController {
  constructor(private readonly sandboxesBulkService: SandboxesBulkService) {}

  @Post('bulk-update')
  @RequirePermission(['sandboxes', 'write-bulk'])
  @ApiOperation({ summary: 'Bulk update sandboxes' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.SANDBOX,
    targetIdsFromRequest: (req) => req.body?.ids,
  })
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateSandboxDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkUpdateResponseDto> {
    const userId = req.user?.id || 'unknown'
    return this.sandboxesBulkService.bulkUpdate(bulkUpdateDto, userId)
  }
}
