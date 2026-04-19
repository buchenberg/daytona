/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { BulkUpdateResponseDto } from '../../common/dto/bulk-response.dto'
import { OrganizationsBulkService } from '../services'
import { BulkUpdateOrganizationDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('organizations')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsBulkController {
  constructor(private readonly organizationsBulkService: OrganizationsBulkService) {}

  @Post('bulk-update')
  @RequirePermission(['organizations', 'write-bulk'])
  @ApiOperation({ summary: 'Bulk update organizations' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.ORGANIZATION,
    targetIdsFromRequest: (req) => req.body?.ids,
  })
  async bulkUpdate(@Body() bulkUpdateDto: BulkUpdateOrganizationDto): Promise<BulkUpdateResponseDto> {
    return this.organizationsBulkService.bulkUpdate(bulkUpdateDto)
  }
}
