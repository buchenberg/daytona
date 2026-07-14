import { Controller, Get, Param, Body, Patch, Post, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam, ApiBody } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { RegionQuotasService } from '../services'
import { PatchRegionQuotaDto, CreateRegionQuotaDto } from '../dto'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'

@ApiTags('region-quotas')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('region-quotas')
export class RegionQuotasController {
  constructor(private readonly regionQuotasService: RegionQuotasService) {}

  @Post()
  @RequirePermission(['regionQuotas', 'write'])
  @ApiOperation({ summary: 'Create a region quota' })
  @ApiBody({ type: CreateRegionQuotaDto })
  @ApiResponse({ status: 201, description: 'Region quota created' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Organization or region not found' })
  @ApiResponse({ status: 409, description: 'Region quota already exists for organization/region pair' })
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.REGION_QUOTA,
    targetIdFromRequest: (req) => `${req.body.organizationId}/${req.body.regionId}`,
  })
  async create(@Body() dto: CreateRegionQuotaDto) {
    return this.regionQuotasService.create(dto)
  }

  @Get('regions')
  @RequirePermission(['regionQuotas', '*'])
  @ApiOperation({ summary: 'List regions a quota can target' })
  @ApiResponse({ status: 200, description: 'Regions' })
  async listRegions() {
    return this.regionQuotasService.listRegions()
  }

  @Patch(':organizationId/:region')
  @RequirePermission(['regionQuotas', 'write'])
  @ApiOperation({ summary: 'Update a region quota' })
  @ApiParam({ name: 'organizationId', description: 'Organization ID' })
  @ApiParam({ name: 'region', description: 'Region ID' })
  @ApiResponse({ status: 200, description: 'Region quota updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Region quota not found' })
  @ApiResponse({ status: 409, description: 'Precondition failed - entity was modified since last read' })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.REGION_QUOTA,
    targetIdFromRequest: (req) => `${req.params.organizationId}/${req.params.region}`,
  })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('region') region: string,
    @Body() patchDto: PatchRegionQuotaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.regionQuotasService.update(organizationId, region, patchDto)
  }
}
