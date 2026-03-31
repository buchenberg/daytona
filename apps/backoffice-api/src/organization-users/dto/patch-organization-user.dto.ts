/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateOrganizationUserDto } from './update-organization-user.dto'

export class PatchOrganizationUserDto {
  @ApiProperty({ type: () => UpdateOrganizationUserDto, description: 'Fields to update' })
  @ValidateNested()
  @Type(() => UpdateOrganizationUserDto)
  updates: UpdateOrganizationUserDto

  @ApiPropertyOptional({
    type: () => UpdateOrganizationUserDto,
    description:
      'Expected current values for optimistic concurrency control. Update fails with 409 if any field does not match.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrganizationUserDto)
  preconditions?: UpdateOrganizationUserDto
}
