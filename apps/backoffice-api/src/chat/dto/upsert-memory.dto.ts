/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpsertMemoryDto {
  @ApiProperty({ description: 'Unique key of the knowledge base entry (upserts on conflict)' })
  @IsString()
  @MaxLength(200)
  key: string

  @ApiProperty({ description: 'The insight or fact to store' })
  @IsString()
  @MaxLength(2000)
  value: string

  @ApiPropertyOptional({ description: 'Entry category', default: 'curated' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string
}
