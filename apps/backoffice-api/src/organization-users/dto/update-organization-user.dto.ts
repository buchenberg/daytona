/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsEnum } from 'class-validator'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { OrganizationMemberRole } from '@api/organization/enums/organization-member-role.enum'

export class UpdateOrganizationUserDto implements Partial<OrganizationUser> {
  @ApiPropertyOptional({ description: 'User role', enum: OrganizationMemberRole })
  @IsOptional()
  @IsEnum(OrganizationMemberRole)
  role?: OrganizationMemberRole
}
