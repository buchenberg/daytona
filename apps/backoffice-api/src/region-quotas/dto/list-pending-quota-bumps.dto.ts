/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class ListPendingQuotaBumpsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number

  @ApiPropertyOptional({ description: 'Number of items per page', default: 25, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number
}
