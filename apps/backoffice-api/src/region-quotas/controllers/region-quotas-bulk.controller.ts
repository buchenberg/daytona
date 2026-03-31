/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common'
import { BulkUpdateResponseDto } from '../../common/dto/bulk-response.dto'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { BackofficeRole } from '../../common/enums/backoffice-role.enum'
import { RegionQuotasBulkService } from '../services'
import { BulkUpdateRegionQuotaDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('region-quotas')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, RolesGuard)
@Roles([BackofficeRole.ADMIN])
@Controller('region-quotas')
export class RegionQuotasBulkController {
  constructor(private readonly regionQuotasBulkService: RegionQuotasBulkService) {}

  @Post('bulk-update')
  @ApiOperation({ summary: 'Bulk update region-quotas' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.REGION_QUOTA,
    targetIdsFromRequest: (req) =>
      req.body?.ids?.map((id: { organizationId: string; region: string }) => `${id.organizationId}:${id.region}`),
  })
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateRegionQuotaDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkUpdateResponseDto> {
    return this.regionQuotasBulkService.bulkUpdate(bulkUpdateDto)
  }
}
