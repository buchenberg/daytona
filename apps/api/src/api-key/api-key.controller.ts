/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiKeyService } from './api-key.service'
import { OrganizationService } from '../organization/services/organization.service'
import { CreateApiKeyDto } from './dto/create-api-key.dto'
import { ProvisionStripeProjectsApiKeyDto } from './dto/provision-stripe-projects-api-key.dto'
import { RotateApiKeyDto } from './dto/rotate-api-key.dto'
import { StripeProjectsApiKeyResponseDto } from './dto/stripe-projects-api-key-response.dto'
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOAuth2,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { ApiKeyResponseDto } from './dto/api-key-response.dto'
import { ApiKeyListDto } from './dto/api-key-list.dto'
import { CustomHeaders } from '../common/constants/header.constants'
import { IsOrganizationAuthContext } from '../common/decorators/auth-context.decorator'
import { OrganizationAuthContext } from '../common/interfaces/organization-auth-context.interface'
import { OrganizationMemberRole } from '../organization/enums/organization-member-role.enum'
import { OrganizationResourcePermission } from '../organization/enums/organization-resource-permission.enum'
import { OrganizationAuthContextGuard } from '../organization/guards/organization-auth-context.guard'
import { StripeProjectsAuthContextGuard } from '../auth/guards/stripe-projects-auth-context.guard'
import { Audit, TypedRequest } from '../audit/decorators/audit.decorator'
import { AuditAction } from '../audit/enums/audit-action.enum'
import { AuditTarget } from '../audit/enums/audit-target.enum'
import { ApiKey } from './api-key.entity'
import { AuthenticatedRateLimitGuard } from '../common/guards/authenticated-rate-limit.guard'
import { AuthStrategy } from '../auth/decorators/auth-strategy.decorator'
import { AuthStrategyType } from '../auth/enums/auth-strategy-type.enum'
import { STRIPE_PROJECTS_API_KEY_PERMISSIONS } from './constants/stripe-projects-api-key-permissions.constant'

@Controller('api-keys')
@ApiTags('api-keys')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@ApiHeader(CustomHeaders.ORGANIZATION_ID)
@AuthStrategy(AuthStrategyType.JWT)
@UseGuards(AuthenticatedRateLimitGuard)
export class ApiKeyController {
  private readonly logger = new Logger(ApiKeyController.name)

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create API key',
    operationId: 'createApiKey',
  })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully.',
    type: ApiKeyResponseDto,
  })
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.API_KEY,
    targetIdFromResult: (result: ApiKeyResponseDto) => result?.name,
    requestMetadata: {
      body: (req: TypedRequest<CreateApiKeyDto>) => ({
        name: req.body?.name,
        permissions: req.body?.permissions,
        expiresAt: req.body?.expiresAt,
      }),
    },
  })
  @UseGuards(OrganizationAuthContextGuard)
  async createApiKey(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    this.validateRequestedApiKeyPermissions(authContext, createApiKeyDto.permissions)

    const { apiKey, value } = await this.apiKeyService.createApiKey(
      authContext.organizationId,
      authContext.userId,
      createApiKeyDto.name,
      createApiKeyDto.permissions,
      createApiKeyDto.expiresAt,
    )

    return ApiKeyResponseDto.fromApiKey(apiKey, value)
  }

  @Get()
  @ApiOperation({
    summary: 'List API keys',
    operationId: 'listApiKeys',
  })
  @ApiResponse({
    status: 200,
    description: 'API keys retrieved successfully.',
    type: [ApiKeyListDto],
  })
  @ApiResponse({ status: 500, description: 'Error fetching API keys.' })
  @UseGuards(OrganizationAuthContextGuard)
  async getApiKeys(@IsOrganizationAuthContext() authContext: OrganizationAuthContext): Promise<ApiKeyListDto[]> {
    let apiKeys: ApiKey[] = []

    if (authContext.organizationUser.role === OrganizationMemberRole.OWNER) {
      apiKeys = await this.apiKeyService.getApiKeys(authContext.organizationId)
    } else {
      apiKeys = await this.apiKeyService.getApiKeys(authContext.organizationId, authContext.userId)
    }

    return apiKeys.map((apiKey) => ApiKeyListDto.fromApiKey(apiKey))
  }

  @Get('current')
  @ApiOperation({
    summary: "Get current API key's details",
    operationId: 'getCurrentApiKey',
  })
  @ApiResponse({
    status: 200,
    description: 'API key retrieved successfully.',
    type: ApiKeyListDto,
  })
  @AuthStrategy(AuthStrategyType.API_KEY)
  @UseGuards(OrganizationAuthContextGuard)
  async getCurrentApiKey(@IsOrganizationAuthContext() authContext: OrganizationAuthContext): Promise<ApiKeyListDto> {
    // Should not happen due to AuthStrategy guard, but needed for type safety
    if (!authContext.apiKey) {
      throw new ForbiddenException('Authenticate with an API key to use this endpoint')
    }

    return ApiKeyListDto.fromApiKey(authContext.apiKey)
  }

  @Get(':name')
  @ApiOperation({
    summary: 'Get API key',
    operationId: 'getApiKey',
  })
  @ApiResponse({
    status: 200,
    description: 'API key retrieved successfully.',
    type: ApiKeyListDto,
  })
  @UseGuards(OrganizationAuthContextGuard)
  async getApiKey(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Param('name') name: string,
  ): Promise<ApiKeyListDto> {
    const apiKey = await this.apiKeyService.getApiKeyByName(authContext.organizationId, authContext.userId, name)
    return ApiKeyListDto.fromApiKey(apiKey)
  }

  @Delete(':name')
  @ApiOperation({
    summary: 'Delete API key',
    operationId: 'deleteApiKey',
  })
  @ApiResponse({ status: 204, description: 'API key deleted successfully.' })
  @HttpCode(204)
  @Audit({
    action: AuditAction.DELETE,
    targetType: AuditTarget.API_KEY,
    targetIdFromRequest: (req) => req.params.name,
  })
  @UseGuards(OrganizationAuthContextGuard)
  async deleteApiKey(@IsOrganizationAuthContext() authContext: OrganizationAuthContext, @Param('name') name: string) {
    await this.apiKeyService.deleteApiKey(authContext.organizationId, authContext.userId, name)
  }

  @Delete(':userId/:name')
  @ApiOperation({
    summary: 'Delete API key for user',
    operationId: 'deleteApiKeyForUser',
  })
  @ApiResponse({ status: 204, description: 'API key deleted successfully.' })
  @HttpCode(204)
  @Audit({
    action: AuditAction.DELETE,
    targetType: AuditTarget.API_KEY,
    targetIdFromRequest: (req) => req.params.name,
    requestMetadata: {
      params: (req) => ({
        userId: req.params.userId,
      }),
    },
  })
  @UseGuards(OrganizationAuthContextGuard)
  async deleteApiKeyForUser(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Param('userId') userId: string,
    @Param('name') name: string,
  ) {
    if (userId !== authContext.userId && authContext.organizationUser.role !== OrganizationMemberRole.OWNER) {
      throw new ForbiddenException('Incorrect user ID provided')
    }

    await this.apiKeyService.deleteApiKey(authContext.organizationId, userId, name)
  }

  @Post('stripe-projects/provision')
  @ApiExcludeEndpoint()
  @AuthStrategy([AuthStrategyType.API_KEY])
  @UseGuards(StripeProjectsAuthContextGuard)
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.API_KEY,
    targetIdFromResult: (result: StripeProjectsApiKeyResponseDto) => result?.apiKeyName,
    requestMetadata: {
      body: (req: TypedRequest<ProvisionStripeProjectsApiKeyDto>) => ({
        userId: req.body?.userId,
      }),
    },
  })
  async provisionStripeProjectsApiKey(
    @Body() dto: ProvisionStripeProjectsApiKeyDto,
  ): Promise<StripeProjectsApiKeyResponseDto> {
    const personalOrg = await this.organizationService.findPersonal(dto.userId)
    const apiKeyName = dto.apiKeyName || `stripe-projects-${Date.now()}`

    const { value } = await this.apiKeyService.createApiKey(
      personalOrg.id,
      dto.userId,
      apiKeyName,
      STRIPE_PROJECTS_API_KEY_PERMISSIONS,
    )

    return {
      apiKey: value,
      apiKeyName,
      organizationId: personalOrg.id,
      userId: dto.userId,
    }
  }

  @Post('stripe-projects/rotate')
  @ApiExcludeEndpoint()
  @AuthStrategy([AuthStrategyType.API_KEY])
  @UseGuards(StripeProjectsAuthContextGuard)
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.API_KEY,
    targetIdFromResult: (result: StripeProjectsApiKeyResponseDto) => result?.apiKeyName,
    requestMetadata: {
      body: (req: TypedRequest<RotateApiKeyDto>) => ({
        organizationId: req.body?.organizationId,
        previousApiKeyName: req.body?.previousApiKeyName,
      }),
    },
  })
  async rotateStripeProjectsApiKey(@Body() dto: RotateApiKeyDto): Promise<StripeProjectsApiKeyResponseDto> {
    const organization = await this.organizationService.findOne(dto.organizationId)
    if (!organization) {
      throw new NotFoundException(`Organization ${dto.organizationId} not found`)
    }
    if (!organization.personal) {
      throw new BadRequestException(`Organization ${dto.organizationId} is not a personal organization`)
    }

    if (dto.previousApiKeyName) {
      try {
        await this.apiKeyService.deleteApiKey(organization.id, organization.createdBy, dto.previousApiKeyName)
      } catch (error) {
        if (error instanceof NotFoundException) {
          this.logger.warn(
            `previous API key "${dto.previousApiKeyName}" not found for user ${organization.createdBy} during rotation; continuing`,
          )
        } else {
          throw error
        }
      }
    }

    const newApiKeyName = dto.newApiKeyName || `stripe-projects-${Date.now()}`
    const { value } = await this.apiKeyService.createApiKey(
      organization.id,
      organization.createdBy,
      newApiKeyName,
      STRIPE_PROJECTS_API_KEY_PERMISSIONS,
    )

    return {
      apiKey: value,
      apiKeyName: newApiKeyName,
      organizationId: organization.id,
      userId: organization.createdBy,
    }
  }

  private validateRequestedApiKeyPermissions(
    authContext: OrganizationAuthContext,
    requestedPermissions: OrganizationResourcePermission[],
  ): void {
    if (authContext.organizationUser.role === OrganizationMemberRole.OWNER) {
      return
    }

    const organizationUserPermissions = new Set(
      authContext.organizationUser.assignedRoles.flatMap((role) => role.permissions),
    )

    const forbiddenPermissions = requestedPermissions.filter(
      (permission) => !organizationUserPermissions.has(permission),
    )

    if (forbiddenPermissions.length) {
      throw new ForbiddenException(`Insufficient permissions for assigning: ${forbiddenPermissions.join(', ')}`)
    }
  }
}
