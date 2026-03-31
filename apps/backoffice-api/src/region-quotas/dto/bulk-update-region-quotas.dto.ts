/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsString, IsBoolean, ArrayMinSize, ArrayMaxSize, ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateRegionQuotaDto } from './update-region-quota.dto'

export class RegionQuotaCompositeKey {
  @ApiProperty()
  @IsString()
  organizationId: string

  @ApiProperty()
  @IsString()
  region: string
}

export class BulkUpdateRegionQuotaDto {
  @ApiProperty({ type: [RegionQuotaCompositeKey], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RegionQuotaCompositeKey)
  ids: RegionQuotaCompositeKey[]

  @ApiProperty({ description: 'Updates to apply to all region quotas', type: UpdateRegionQuotaDto })
  @ValidateNested()
  @Type(() => UpdateRegionQuotaDto)
  updates: UpdateRegionQuotaDto

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean
}
