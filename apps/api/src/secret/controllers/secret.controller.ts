/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, HttpCode, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOAuth2, ApiHeader, ApiParam, ApiBearerAuth } from '@nestjs/swagger'
import { SecretService } from '../services/secret.service'
import { CreateSecretDto } from '../dto/create-secret.dto'
import { UpdateSecretDto } from '../dto/update-secret.dto'
import { SecretDto } from '../dto/secret.dto'
import { ListSecretsQueryDto } from '../dto/list-secrets-query.dto'
import { ListSecretsResponseDto } from '../dto/list-secrets-response.dto'
import { AuthStrategy } from '../../auth/decorators/auth-strategy.decorator'
import { AuthStrategyType } from '../../auth/enums/auth-strategy-type.enum'
import { CustomHeaders } from '../../common/constants/header.constants'
import { IsOrganizationAuthContext } from '../../common/decorators/auth-context.decorator'
import { OrganizationAuthContext } from '../../common/interfaces/organization-auth-context.interface'
import { RequiredOrganizationResourcePermissions } from '../../organization/decorators/required-organization-resource-permissions.decorator'
import { OrganizationResourcePermission } from '../../organization/enums/organization-resource-permission.enum'
import { OrganizationAuthContextGuard } from '../../organization/guards/organization-auth-context.guard'
import { Audit, MASKED_AUDIT_VALUE, TypedRequest } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'

@Controller('secret')
@ApiTags('secret')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@ApiHeader(CustomHeaders.ORGANIZATION_ID)
@AuthStrategy([AuthStrategyType.API_KEY, AuthStrategyType.JWT])
@UseGuards(AuthenticatedRateLimitGuard)
@UseGuards(OrganizationAuthContextGuard)
export class SecretController {
  constructor(private readonly secretService: SecretService) {}

  @Post()
  @ApiOperation({
    summary: 'Create secret',
    operationId: 'createSecret',
  })
  @ApiResponse({
    status: 201,
    description: 'The secret has been successfully created.',
    type: SecretDto,
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.MANAGE_SECRETS])
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.SECRET,
    targetIdFromResult: (result: SecretDto) => result?.id,
    requestMetadata: {
      body: (req: TypedRequest<CreateSecretDto>) => ({
        name: req.body?.name,
        value: req.body?.value !== undefined ? MASKED_AUDIT_VALUE : undefined,
        description: req.body?.description,
        hosts: req.body?.hosts,
      }),
    },
  })
  async create(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Body() createSecretDto: CreateSecretDto,
  ): Promise<SecretDto> {
    const secret = await this.secretService.create(createSecretDto, authContext.organization)
    return SecretDto.fromSecret(secret)
  }

  @Get()
  @ApiOperation({
    summary: 'List secrets',
    operationId: 'listSecrets',
    deprecated: true,
    description:
      'This endpoint is deprecated and fails for organizations with more than 1500 secrets. Use `listSecretsPaginated` instead.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all secrets (metadata only, values are not returned)',
    type: [SecretDto],
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.MANAGE_SECRETS])
  async findAll(@IsOrganizationAuthContext() authContext: OrganizationAuthContext): Promise<SecretDto[]> {
    const secrets = await this.secretService.findAll(authContext.organizationId)
    return secrets.map(SecretDto.fromSecret)
  }

  @Get('paginated')
  @ApiOperation({
    summary: 'List secrets with pagination',
    operationId: 'listSecretsPaginated',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of secrets (metadata only, values are not returned)',
    type: ListSecretsResponseDto,
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.MANAGE_SECRETS])
  async findAllPaginated(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Query() queryParams: ListSecretsQueryDto,
  ): Promise<ListSecretsResponseDto> {
    const { cursor, limit, name, sort, order } = queryParams

    const result = await this.secretService.findAllPaginated(
      authContext.organizationId,
      cursor,
      limit,
      { name },
      { field: sort, direction: order },
    )

    return {
      items: result.items.map(SecretDto.fromSecret),
      total: result.total,
      nextCursor: result.nextCursor,
    }
  }

  @Get(':secretId')
  @ApiOperation({
    summary: 'Get secret',
    operationId: 'getSecret',
  })
  @ApiParam({
    name: 'secretId',
    description: 'ID of the secret',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'The secret metadata (value is not returned)',
    type: SecretDto,
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.MANAGE_SECRETS])
  async findOne(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Param('secretId') secretId: string,
  ): Promise<SecretDto> {
    const secret = await this.secretService.findOne(secretId, authContext.organizationId)
    return SecretDto.fromSecret(secret)
  }

  @Patch(':secretId')
  @ApiOperation({
    summary: 'Update secret',
    operationId: 'updateSecret',
  })
  @ApiParam({
    name: 'secretId',
    description: 'ID of the secret',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'The secret has been successfully updated.',
    type: SecretDto,
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.MANAGE_SECRETS])
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.SECRET,
    targetIdFromRequest: (req) => req.params.secretId,
    requestMetadata: {
      body: (req: TypedRequest<UpdateSecretDto>) => ({
        value: req.body?.value !== undefined ? MASKED_AUDIT_VALUE : undefined,
        description: req.body?.description,
        hosts: req.body?.hosts,
      }),
    },
  })
  async update(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Param('secretId') secretId: string,
    @Body() updateSecretDto: UpdateSecretDto,
  ): Promise<SecretDto> {
    const secret = await this.secretService.update(secretId, updateSecretDto, authContext.organizationId)
    return SecretDto.fromSecret(secret)
  }

  @Delete(':secretId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete secret',
    operationId: 'deleteSecret',
  })
  @ApiParam({
    name: 'secretId',
    description: 'ID of the secret',
    type: 'string',
  })
  @ApiResponse({
    status: 204,
    description: 'The secret has been successfully deleted.',
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.MANAGE_SECRETS])
  @Audit({
    action: AuditAction.DELETE,
    targetType: AuditTarget.SECRET,
    targetIdFromRequest: (req) => req.params.secretId,
  })
  async remove(
    @IsOrganizationAuthContext() authContext: OrganizationAuthContext,
    @Param('secretId') secretId: string,
  ): Promise<void> {
    return this.secretService.remove(secretId, authContext.organizationId)
  }
}
