import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiHeader, ApiOAuth2, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequireFlagsEnabled } from '@openfeature/nestjs-sdk'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'
import { CustomHeaders } from '../../common/constants/header.constants'
import { FeatureFlags } from '../../common/constants/feature-flags'
import { AuthStrategy } from '../../auth/decorators/auth-strategy.decorator'
import { AuthStrategyType } from '../../auth/enums/auth-strategy-type.enum'
import { IsOrganizationAuthContext } from '../../common/decorators/auth-context.decorator'
import { OrganizationAuthContext } from '../../common/interfaces/organization-auth-context.interface'
import { OrganizationAuthContextGuard } from '../../organization/guards/organization-auth-context.guard'
import { RequiredOrganizationResourcePermissions } from '../../organization/decorators/required-organization-resource-permissions.decorator'
import { OrganizationResourcePermission } from '../../organization/enums/organization-resource-permission.enum'
import { Audit, TypedRequest } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { WarmPoolService } from '../services/warm-pool.service'
import { CreateWarmPoolDto } from '../dto/create-warm-pool.dto'
import { UpdateWarmPoolDto } from '../dto/update-warm-pool.dto'
import { WarmPoolDto } from '../dto/warm-pool.dto'

@ApiTags('warm-pools')
@Controller('warm-pools')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@ApiHeader(CustomHeaders.ORGANIZATION_ID)
@AuthStrategy([AuthStrategyType.API_KEY, AuthStrategyType.JWT])
@UseGuards(AuthenticatedRateLimitGuard)
@UseGuards(OrganizationAuthContextGuard)
@RequireFlagsEnabled({ flags: [{ flagKey: FeatureFlags.SELF_SERVE_WARM_POOL, defaultValue: false }] })
export class WarmPoolController {
  private readonly logger = new Logger(WarmPoolController.name)

  constructor(private readonly warmPoolService: WarmPoolService) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'List warm pools for the organization', operationId: 'listWarmPools' })
  @ApiResponse({ status: 200, description: 'List of warm pools', type: [WarmPoolDto] })
  async listWarmPools(@IsOrganizationAuthContext() authContext: OrganizationAuthContext): Promise<WarmPoolDto[]> {
    return this.warmPoolService.findAll(authContext.organizationId)
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a warm pool', operationId: 'createWarmPool' })
  @ApiResponse({ status: 201, description: 'The warm pool has been created', type: WarmPoolDto })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_SANDBOXES])
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.WARM_POOL,
    targetIdFromResult: (result: WarmPoolDto) => result?.id,
    requestMetadata: {
      body: (req: TypedRequest<CreateWarmPoolDto>) => ({
        snapshot: req.body?.snapshot,
        pool: req.body?.pool,
        target: req.body?.target,
      }),
    },
  })
  async createWarmPool(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Body() createWarmPoolDto: CreateWarmPoolDto,
  ): Promise<WarmPoolDto> {
    return this.warmPoolService.create(authContext.organizationId, createWarmPoolDto)
  }

  @Patch(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a warm pool size', operationId: 'updateWarmPool' })
  @ApiParam({ name: 'id', description: 'Warm pool ID' })
  @ApiResponse({ status: 200, description: 'The warm pool has been updated', type: WarmPoolDto })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_SANDBOXES])
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.WARM_POOL,
    targetIdFromRequest: (req) => req.params.id,
    requestMetadata: {
      body: (req: TypedRequest<UpdateWarmPoolDto>) => ({
        pool: req.body?.pool,
      }),
    },
  })
  async updateWarmPool(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Param('id') id: string,
    @Body() updateWarmPoolDto: UpdateWarmPoolDto,
  ): Promise<WarmPoolDto> {
    return this.warmPoolService.update(authContext.organizationId, id, updateWarmPoolDto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a warm pool', operationId: 'deleteWarmPool' })
  @ApiParam({ name: 'id', description: 'Warm pool ID' })
  @ApiResponse({ status: 204, description: 'The warm pool has been deleted' })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.DELETE_SANDBOXES])
  @Audit({
    action: AuditAction.DELETE,
    targetType: AuditTarget.WARM_POOL,
    targetIdFromRequest: (req) => req.params.id,
  })
  async deleteWarmPool(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.warmPoolService.remove(authContext.organizationId, id)
  }
}
