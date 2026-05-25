/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  Controller,
  Param,
  Body,
  Patch,
  Post,
  UseGuards,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { SnapshotsService } from '../services'
import { PatchSnapshotDto, AddToWarmPoolDto, AddToWarmPoolResponseDto } from '../dto'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SnapshotRegion } from '@api/sandbox/entities/snapshot-region.entity'
import { WarmPool } from '@api/sandbox/entities/warm-pool.entity'
import { Region } from '@api/region/entities/region.entity'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('snapshots')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('snapshots')
export class SnapshotsController {
  constructor(
    private readonly snapshotsService: SnapshotsService,
    @InjectRepository(Snapshot)
    private readonly snapshotRepository: Repository<Snapshot>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Patch(':id')
  @RequirePermission(['snapshots', 'write'])
  @ApiOperation({ summary: 'Update a snapshot' })
  @ApiParam({ name: 'id', description: 'Snapshot ID' })
  @ApiResponse({ status: 200, description: 'Snapshot updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Snapshot not found' })
  @ApiResponse({ status: 409, description: 'Precondition failed - entity was modified since last read' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.SNAPSHOT,
    targetIdFromRequest: (req) => req.params.id,
  })
  async update(@Param('id') id: string, @Body() patchDto: PatchSnapshotDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'unknown'
    return this.snapshotsService.update(id, patchDto, userId)
  }

  @Post(':id/add-to-warm-pool')
  @RequirePermission(['snapshots', 'write'])
  @ApiOperation({ summary: 'Add snapshot to warm pool' })
  @ApiParam({ name: 'id', description: 'Snapshot ID' })
  @ApiResponse({ status: 201, description: 'Snapshot added to warm pool', type: AddToWarmPoolResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Snapshot not found' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.SNAPSHOT,
    targetIdFromRequest: (req) => req.params.id,
  })
  async addToWarmPool(
    @Param('id') snapshotId: string,
    @Body() dto: AddToWarmPoolDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AddToWarmPoolResponseDto> {
    const snapshot = await this.snapshotRepository.findOne({
      where: { id: snapshotId },
      relations: ['buildInfo'],
    })

    if (!snapshot) {
      throw new NotFoundException('Snapshot not found')
    }

    const adminOrgId = this.configService.get('admin.organizationId')
    if (!adminOrgId) {
      throw new BadRequestException('Admin organization ID not configured')
    }

    const targetRegion = await this.regionRepository.findOne({ where: { id: dto.target } })
    if (!targetRegion) {
      throw new NotFoundException(`Region ${dto.target} not found`)
    }

    // All three writes run in a single transaction so a failure on any step rolls back the rest
    // and we never leave an orphaned warm pool / copied snapshot behind.
    const { savedWarmPool, savedSnapshot } = await this.dataSource.transaction(async (manager) => {
      const warmPool = manager.create(WarmPool, {
        pool: dto.pool,
        snapshot: snapshot.name,
        target: dto.target,
        cpu: snapshot.cpu,
        mem: snapshot.mem,
        disk: snapshot.disk,
        gpu: snapshot.gpu,
        gpuType: snapshot.buildInfo?.snapshotRef || '',
        class: SandboxClass.SMALL,
        osUser: 'daytona',
        errorReason: null,
        env: {},
      })
      const savedWarmPool = await manager.save(warmPool)

      const copiedSnapshot = manager.create(Snapshot, {
        ...snapshot,
        id: undefined,
        organizationId: adminOrgId,
        general: true,
        hideFromUsers: true,
      })
      const savedSnapshot = await manager.save(copiedSnapshot)

      await manager.save(SnapshotRegion, { snapshotId: savedSnapshot.id, regionId: dto.target })

      return { savedWarmPool, savedSnapshot }
    })

    return {
      success: true,
      warmPoolId: savedWarmPool.id,
      copiedSnapshotId: savedSnapshot.id,
    }
  }
}
