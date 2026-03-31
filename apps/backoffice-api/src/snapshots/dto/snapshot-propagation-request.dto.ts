/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNumber, Min, Max, IsBoolean, IsOptional } from 'class-validator'

export class SnapshotPropagationRequestDto {
  @ApiProperty({ description: 'Region to propagate snapshot to' })
  @IsString()
  region: string

  @ApiProperty({ description: 'Maximum number of runners to propagate to', default: 25, minimum: 1, maximum: 100 })
  @IsNumber()
  @Min(1)
  @Max(100)
  maxRunners: number

  @ApiPropertyOptional({ description: 'Dry run mode - validate without inserting', default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean
}
