/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Param, Body, Patch, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { RegionQuotasService } from '../services'
import { PatchRegionQuotaDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('region-quotas')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('region-quotas')
export class RegionQuotasController {
  constructor(private readonly regionQuotasService: RegionQuotasService) {}

  @Patch(':organizationId/:region')
  @RequirePermission(['regionQuotas', 'write'])
  @ApiOperation({ summary: 'Update a region quota' })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiParam({ name: 'region', description: 'Region ID' })
  @ApiResponse({ status: 200, description: 'Region quota updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Region quota not found' })
  @ApiResponse({ status: 409, description: 'Precondition failed - entity was modified since last read' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.REGION_QUOTA,
    targetIdFromRequest: (req) => `${req.params.organizationId}/${req.params.region}`,
  })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('region') region: string,
    @Body() patchDto: PatchRegionQuotaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.regionQuotasService.update(organizationId, region, patchDto)
  }
}
