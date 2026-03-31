/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { BackofficeRole } from '../../common/enums/backoffice-role.enum'
import { BulkUpdateResponseDto } from '../../common/dto/bulk-response.dto'
import { OrganizationsBulkService } from '../services'
import { BulkUpdateOrganizationDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('organizations')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, RolesGuard)
@Roles([BackofficeRole.ADMIN])
@Controller('organizations')
export class OrganizationsBulkController {
  constructor(private readonly organizationsBulkService: OrganizationsBulkService) {}

  @Post('bulk-update')
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
