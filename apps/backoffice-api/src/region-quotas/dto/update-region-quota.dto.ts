/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsNumber } from 'class-validator'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'

export class UpdateRegionQuotaDto implements Partial<RegionQuota> {
  @ApiPropertyOptional({ description: 'Total CPU quota' })
  @IsOptional()
  @IsNumber()
  totalCpuQuota?: number

  @ApiPropertyOptional({ description: 'Total memory quota in GB' })
  @IsOptional()
  @IsNumber()
  totalMemoryQuota?: number

  @ApiPropertyOptional({ description: 'Total disk quota in GB' })
  @IsOptional()
  @IsNumber()
  totalDiskQuota?: number
}
