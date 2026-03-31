/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'

export class RangeDto {
  @ApiPropertyOptional({ description: 'Minimum value (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  min?: number

  @ApiPropertyOptional({ description: 'Maximum value (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  max?: number
}
