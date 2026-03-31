/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { BackofficeRole } from '../../common/enums/backoffice-role.enum'
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiExtraModels, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { UserDeletionPreviewService } from '../services/user-deletion-preview.service'
import { UserDeletionService } from '../services/user-deletion.service'
import {
  UserDeletionPreviewDto,
  OrganizationPreviewDto,
  SandboxPreviewDto,
  SnapshotPreviewDto,
} from '../dto/user-deletion-preview.dto'
import { UserDeletionRequestDto } from '../dto/user-deletion-request.dto'
import { UserDeletionResponseDto, ExecutedActionsDto, ManualStepDto } from '../dto/user-deletion-response.dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('users')
@ApiSecurity('bearerAuth')
@Controller('users')
@UseGuards(FlexibleAuthGuard)
@ApiExtraModels(OrganizationPreviewDto, SandboxPreviewDto, SnapshotPreviewDto, ExecutedActionsDto, ManualStepDto)
export class UserDeletionController {
  constructor(
    private readonly userDeletionPreviewService: UserDeletionPreviewService,
    private readonly userDeletionService: UserDeletionService,
  ) {}

  @Get(':userId/deletion-preview')
  @ApiOperation({ summary: 'Preview user deletion impact' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Deletion preview', type: UserDeletionPreviewDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Audit({
    action: AuditAction.DELETION_PREVIEW,
    targetType: AuditTarget.USER,
    targetIdFromRequest: (req) => req.params.userId,
  })
  async previewDeletion(@Param('userId') userId: string) {
    return await this.userDeletionPreviewService.preview(userId)
  }

  @Post(':userId/delete')
  @UseGuards(RolesGuard)
  @Roles([BackofficeRole.ADMIN])
  @ApiOperation({ summary: 'Delete user and associated resources' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully', type: UserDeletionResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Audit({
    action: AuditAction.DELETE,
    targetType: AuditTarget.USER,
    targetIdFromRequest: (req) => req.params.userId,
  })
  async deleteUser(@Param('userId') userId: string, @Body() requestDto: UserDeletionRequestDto) {
    return await this.userDeletionService.deleteUser(userId, requestDto)
  }
}
