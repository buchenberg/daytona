/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, Min, Max, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1

  @ApiPropertyOptional({ description: 'Items per page', default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number = 25
}

export class PaginationResponseDto {
  @ApiPropertyOptional({ description: 'Current page number' })
  page: number

  @ApiPropertyOptional({ description: 'Items per page' })
  pageSize: number

  @ApiPropertyOptional({ description: 'Total number of items' })
  total: number

  @ApiPropertyOptional({ description: 'Total number of pages' })
  totalPages: number
}
