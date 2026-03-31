/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsUUID, IsBoolean, ArrayMinSize, ArrayMaxSize, ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateRunnerDto } from './update-runner.dto'

export class BulkUpdateRunnerDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  ids: string[]

  @ApiProperty({ description: 'Updates to apply to all runners', type: UpdateRunnerDto })
  @ValidateNested()
  @Type(() => UpdateRunnerDto)
  updates: UpdateRunnerDto

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean
}
