/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Param, Body, Patch, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { SandboxesService } from '../services'
import { PatchSandboxDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('sandboxes')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('sandboxes')
export class SandboxesController {
  constructor(private readonly sandboxesService: SandboxesService) {}

  @Patch(':id')
  @RequirePermission(['sandboxes', 'write'])
  @ApiOperation({ summary: 'Update a sandbox' })
  @ApiParam({ name: 'id', description: 'Sandbox ID' })
  @ApiResponse({ status: 200, description: 'Sandbox updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Sandbox not found' })
  @ApiResponse({ status: 409, description: 'Precondition failed - entity was modified since last read' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.SANDBOX,
    targetIdFromRequest: (req) => req.params.id,
  })
  async update(@Param('id') id: string, @Body() patchDto: PatchSandboxDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'unknown'
    return this.sandboxesService.update(id, patchDto, userId)
  }
}
