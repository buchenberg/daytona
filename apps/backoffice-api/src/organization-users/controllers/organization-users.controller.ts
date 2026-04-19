/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Param, Body, Patch, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { OrganizationUsersService } from '../services'
import { PatchOrganizationUserDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('organization-users')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('organization-users')
export class OrganizationUsersController {
  constructor(private readonly organizationUsersService: OrganizationUsersService) {}

  @Patch(':organizationId/:userId')
  @RequirePermission(['organizationUsers', 'write'])
  @ApiOperation({ summary: 'Update an organization user' })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Organization user updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Organization user not found' })
  @ApiResponse({ status: 409, description: 'Precondition failed - entity was modified since last read' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.ORGANIZATION_USER,
    targetIdFromRequest: (req) => `${req.params.organizationId}/${req.params.userId}`,
  })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @Body() patchDto: PatchOrganizationUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const actorId = req.user?.id || 'unknown'
    return this.organizationUsersService.update(organizationId, userId, patchDto, actorId)
  }
}
