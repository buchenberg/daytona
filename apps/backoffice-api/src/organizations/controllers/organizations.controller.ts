/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Param, Body, Patch, Post, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { OrganizationsService } from '../services'
import { PatchOrganizationDto, InitializeWebhooksResponseDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('organizations')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  @Patch(':id')
  @RequirePermission(['organizations', 'write'])
  @ApiOperation({ summary: 'Update an organization' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({ status: 409, description: 'Precondition failed - entity was modified since last read' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.ORGANIZATION,
    targetIdFromRequest: (req) => req.params.id,
  })
  async update(@Param('id') id: string, @Body() patchDto: PatchOrganizationDto) {
    return this.organizationsService.update(id, patchDto)
  }

  @Post(':id/initialize-webhooks')
  @RequirePermission(['organizations', 'write'])
  @ApiOperation({ summary: 'Initialize webhooks for organization' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 200, description: 'Webhooks initialized successfully', type: InitializeWebhooksResponseDto })
  @ApiResponse({ status: 400, description: 'Failed to initialize webhooks' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.ORGANIZATION,
    targetIdFromRequest: (req) => req.params.id,
  })
  async initializeWebhooks(@Param('id') organizationId: string): Promise<InitializeWebhooksResponseDto> {
    const externalApiUrl = this.configService.get('externalApi.baseUrl')
    const adminKey = this.configService.get('externalApi.adminKey')

    if (!adminKey) {
      throw new BadRequestException('Admin API key not configured')
    }

    const url = `${externalApiUrl}/webhooks/organizations/${organizationId}/initialize`

    await firstValueFrom(
      this.httpService.post(
        url,
        {},
        {
          headers: {
            Authorization: `Bearer ${adminKey}`,
          },
        },
      ),
    )

    return {
      success: true,
      message: 'Webhooks initialized successfully',
    }
  }
}
