/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator'

export class CreateRegionQuotaDto {
  @ApiProperty({ description: 'Organization ID (UUID)' })
  @IsString()
  @IsNotEmpty()
  organizationId: string

  @ApiProperty({ description: 'Region ID (e.g. "us", "eu")' })
  @IsString()
  @IsNotEmpty()
  regionId: string

  @ApiProperty({ description: 'Total CPU quota for the region' })
  @IsNumber()
  @Min(0)
  totalCpuQuota: number

  @ApiProperty({ description: 'Total memory quota (GB) for the region' })
  @IsNumber()
  @Min(0)
  totalMemoryQuota: number

  @ApiProperty({ description: 'Total disk quota (GB) for the region' })
  @IsNumber()
  @Min(0)
  totalDiskQuota: number

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
      'Max disk (GB) for non-ephemeral sandboxes. null = fall back to maxDiskPerSandbox. 0 = disabled in this region.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  maxDiskPerNonEphemeralSandbox?: number | null
}
