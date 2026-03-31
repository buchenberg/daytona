/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Param, Body, Patch, Post, UseGuards, Req, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { BackofficeRole } from '../../common/enums/backoffice-role.enum'
import { OrganizationsService } from '../services'
import { PatchOrganizationDto, InitializeWebhooksResponseDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('organizations')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, RolesGuard)
@Roles([BackofficeRole.ADMIN])
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  @Patch(':id')
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
  async update(@Param('id') id: string, @Body() patchDto: PatchOrganizationDto, @Req() req: AuthenticatedRequest) {
    return this.organizationsService.update(id, patchDto)
  }

  @Post(':id/initialize-webhooks')
  @ApiOperation({ summary: 'Initialize webhooks for organization' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 200, description: 'Webhooks initialized successfully', type: InitializeWebhooksResponseDto })
  @ApiResponse({ status: 400, description: 'Failed to initialize webhooks' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.ORGANIZATION,
    targetIdFromRequest: (req) => req.params.id,
  })
  async initializeWebhooks(
    @Param('id') organizationId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<InitializeWebhooksResponseDto> {
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
