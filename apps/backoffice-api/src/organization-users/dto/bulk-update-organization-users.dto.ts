/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsString, IsBoolean, ArrayMinSize, ArrayMaxSize, ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateOrganizationUserDto } from './update-organization-user.dto'

export class OrganizationUserCompositeKey {
  @ApiProperty()
  @IsString()
  organizationId: string

  @ApiProperty()
  @IsString()
  userId: string
}

export class BulkUpdateOrganizationUserDto {
  @ApiProperty({ type: [OrganizationUserCompositeKey], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OrganizationUserCompositeKey)
  ids: OrganizationUserCompositeKey[]

  @ApiProperty({ description: 'Updates to apply to all organization users', type: UpdateOrganizationUserDto })
  @ValidateNested()
  @Type(() => UpdateOrganizationUserDto)
  updates: UpdateOrganizationUserDto

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean
}
