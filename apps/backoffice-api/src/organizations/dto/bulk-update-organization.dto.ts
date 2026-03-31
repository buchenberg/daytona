/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsUUID, IsBoolean, ArrayMinSize, ArrayMaxSize, ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateOrganizationDto } from './update-organization.dto'

/**
 * DTO for bulk updating organizations
 */
export class BulkUpdateOrganizationDto {
  @ApiProperty({
    description: 'Array of organization IDs to update',
    type: [String],
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  ids: string[]

  @ApiProperty({ description: 'Updates to apply to all organizations', type: UpdateOrganizationDto })
  @ValidateNested()
  @Type(() => UpdateOrganizationDto)
  updates: UpdateOrganizationDto

  @ApiPropertyOptional({ description: 'Dry run mode - validate without applying changes', default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean
}
