/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateOrganizationDto } from './update-organization.dto'

export class PatchOrganizationDto {
  @ApiProperty({ type: () => UpdateOrganizationDto, description: 'Fields to update' })
  @ValidateNested()
  @Type(() => UpdateOrganizationDto)
  updates: UpdateOrganizationDto

  @ApiPropertyOptional({
    type: () => UpdateOrganizationDto,
    description:
      'Expected current values for optimistic concurrency control. Update fails with 409 if any field does not match.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrganizationDto)
  preconditions?: UpdateOrganizationDto
}
