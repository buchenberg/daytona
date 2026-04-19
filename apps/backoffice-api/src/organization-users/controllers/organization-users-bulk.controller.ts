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
import { OrganizationUsersBulkService } from '../services'
import { BulkUpdateOrganizationUserDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('organization-users')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('organization-users')
export class OrganizationUsersBulkController {
  constructor(private readonly organizationUsersBulkService: OrganizationUsersBulkService) {}

  @Post('bulk-update')
  @RequirePermission(['organizationUsers', 'write-bulk'])
  @ApiOperation({ summary: 'Bulk update organization-users' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.ORGANIZATION_USER,
    targetIdsFromRequest: (req) =>
      req.body?.ids?.map((id: { organizationId: string; userId: string }) => `${id.organizationId}:${id.userId}`),
  })
  async bulkUpdate(@Body() bulkUpdateDto: BulkUpdateOrganizationUserDto): Promise<BulkUpdateResponseDto> {
    return this.organizationUsersBulkService.bulkUpdate(bulkUpdateDto)
  }
}
