/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean } from 'class-validator'

export class UserFiltersDto {
  @ApiPropertyOptional({ description: 'Search by email or user ID (partial match)' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter by user email (partial match)' })
  @IsOptional()
  @IsString()
  email?: string

  @ApiPropertyOptional({ description: 'Filter by user name (partial match)' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string

  @ApiPropertyOptional({ description: 'Filter by email verified status' })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean

  @ApiPropertyOptional({ description: 'Created after date (ISO 8601)' })
  @IsOptional()
  @IsString()
  createdAfter?: string

  @ApiPropertyOptional({ description: 'Created before date (ISO 8601)' })
  @IsOptional()
  @IsString()
  createdBefore?: string
}
