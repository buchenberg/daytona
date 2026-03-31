/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateRegionQuotaDto } from './update-region-quota.dto'

export class PatchRegionQuotaDto {
  @ApiProperty({ type: () => UpdateRegionQuotaDto, description: 'Fields to update' })
  @ValidateNested()
  @Type(() => UpdateRegionQuotaDto)
  updates: UpdateRegionQuotaDto

  @ApiPropertyOptional({
    type: () => UpdateRegionQuotaDto,
    description:
      'Expected current values for optimistic concurrency control. Update fails with 409 if any field does not match.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRegionQuotaDto)
  preconditions?: UpdateRegionQuotaDto
}
