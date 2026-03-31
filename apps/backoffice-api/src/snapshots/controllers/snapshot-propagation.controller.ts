/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiExtraModels, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { BackofficeRole } from '../../common/enums/backoffice-role.enum'
import { SnapshotPropagationService } from '../services/snapshot-propagation.service'
import { SnapshotPropagationRequestDto } from '../dto/snapshot-propagation-request.dto'
import { SnapshotPropagationResponseDto, SnapshotPropagationStatusDto } from '../dto/snapshot-propagation-response.dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('snapshots')
@ApiSecurity('bearerAuth')
@Controller('snapshots')
@UseGuards(FlexibleAuthGuard, RolesGuard)
@Roles([BackofficeRole.ADMIN])
@ApiExtraModels(SnapshotPropagationStatusDto)
export class SnapshotPropagationController {
  constructor(private readonly snapshotPropagationService: SnapshotPropagationService) {}

  @Post(':snapshotId/propagate')
  @ApiOperation({ summary: 'Propagate snapshot to runners in a region' })
  @ApiParam({ name: 'snapshotId', description: 'Snapshot ID' })
  @ApiResponse({ status: 200, description: 'Propagation completed', type: SnapshotPropagationResponseDto })
  @ApiResponse({ status: 404, description: 'Snapshot not found' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Audit({
    action: AuditAction.PROPAGATE,
    targetType: AuditTarget.SNAPSHOT,
    targetIdFromRequest: (req) => req.params.snapshotId,
  })
  async propagate(@Param('snapshotId') snapshotId: string, @Body() requestDto: SnapshotPropagationRequestDto) {
    return await this.snapshotPropagationService.propagate(snapshotId, requestDto)
  }
}
