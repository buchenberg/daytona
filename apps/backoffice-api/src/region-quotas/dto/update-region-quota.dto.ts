/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsNumber, IsInt, Min, ValidateIf } from 'class-validator'
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

  @ApiPropertyOptional({
    description: 'Max CPU per sandbox in this region. null = use organization default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  maxCpuPerSandbox?: number | null

  @ApiPropertyOptional({
    description: 'Max memory (GB) per sandbox in this region. null = use organization default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  maxMemoryPerSandbox?: number | null

  @ApiPropertyOptional({
    description: 'Max disk (GB) per sandbox in this region. null = use organization default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  maxDiskPerSandbox?: number | null

  @ApiPropertyOptional({
    description:
      'Max disk (GB) for non-ephemeral sandboxes. null = fall back to maxDiskPerSandbox. 0 = non-ephemeral sandboxes disabled in this region.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  maxDiskPerNonEphemeralSandbox?: number | null
}
