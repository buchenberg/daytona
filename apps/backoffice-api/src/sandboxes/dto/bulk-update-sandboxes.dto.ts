/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsUUID, IsBoolean, ArrayMinSize, ArrayMaxSize, ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateSandboxDto } from './update-sandbox.dto'

export class BulkUpdateSandboxDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  ids: string[]

  @ApiProperty({ description: 'Updates to apply to all sandboxes', type: UpdateSandboxDto })
  @ValidateNested()
  @Type(() => UpdateSandboxDto)
  updates: UpdateSandboxDto

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean
}
