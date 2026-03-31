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
import { OrganizationUsersBulkService } from '../services'
import { BulkUpdateOrganizationUserDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('organization-users')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, RolesGuard)
@Roles([BackofficeRole.ADMIN])
@Controller('organization-users')
export class OrganizationUsersBulkController {
  constructor(private readonly organizationUsersBulkService: OrganizationUsersBulkService) {}

  @Post('bulk-update')
  @ApiOperation({ summary: 'Bulk update organization-users' })
  @ApiResponse({ status: 200, description: 'Bulk update completed', type: BulkUpdateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Audit({
    action: AuditAction.BULK_UPDATE,
    targetType: AuditTarget.ORGANIZATION_USER,
    targetIdsFromRequest: (req) =>
      req.body?.ids?.map((id: { organizationId: string; userId: string }) => `${id.organizationId}:${id.userId}`),
  })
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateOrganizationUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkUpdateResponseDto> {
    return this.organizationUsersBulkService.bulkUpdate(bulkUpdateDto)
  }
}
