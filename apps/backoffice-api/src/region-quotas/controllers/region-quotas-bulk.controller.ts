/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { BulkUpdateResponseDto } from '../../common/dto/bulk-response.dto'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { RegionQuotasBulkService } from '../services'
import { BulkUpdateRegionQuotaDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('region-quotas')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('region-quotas')
export class RegionQuotasBulkController {
  constructor(private readonly regionQuotasBulkService: RegionQuotasBulkService) {}

  @Post('bulk-update')
  @RequirePermission(['regionQuotas', 'write-bulk'])
  @ApiOperation({ summary: 'Bulk update region-quotas' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.REGION_QUOTA,
    targetIdsFromRequest: (req) =>
      req.body?.ids?.map((id: { organizationId: string; region: string }) => `${id.organizationId}:${id.region}`),
  })
  async bulkUpdate(@Body() bulkUpdateDto: BulkUpdateRegionQuotaDto): Promise<BulkUpdateResponseDto> {
    return this.regionQuotasBulkService.bulkUpdate(bulkUpdateDto)
  }
}
