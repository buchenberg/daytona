/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsOptional, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { CreateRunnerDto } from './create-runner.dto'

export class BulkInsertRunnerDto {
  @ApiProperty({
    description: 'Array of runner data to insert',
    type: [CreateRunnerDto],
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateRunnerDto)
  runners: CreateRunnerDto[]

  @ApiPropertyOptional({
    description: 'Dry run mode - validate without inserting',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean

  @ApiPropertyOptional({
    description: 'Skip validation errors and insert valid runners only',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  skipErrors?: boolean
}

export class BulkInsertErrorDto {
  @ApiProperty({ description: 'Error code' })
  code: string

  @ApiProperty({ description: 'Error message' })
  message: string
}

export class BulkInsertResultDto {
  @ApiProperty({ description: 'Runner domain' })
  domain: string

  @ApiProperty({ description: 'Whether the insert was successful' })
  success: boolean

  @ApiPropertyOptional({ description: 'Inserted runner data' })
  data?: any

  @ApiPropertyOptional({ description: 'Error details if insert failed', type: BulkInsertErrorDto })
  error?: BulkInsertErrorDto
}

export class BulkInsertResponseDto {
  @ApiProperty({ description: 'Total number of runners processed' })
  totalProcessed: number

  @ApiProperty({ description: 'Number of successful inserts' })
  successCount: number

  @ApiProperty({ description: 'Number of failed inserts' })
  failureCount: number

  @ApiProperty({ description: 'Number of skipped (duplicate) runners' })
  skippedCount: number

  @ApiProperty({ description: 'Array of individual insert results', type: [BulkInsertResultDto] })
  results: BulkInsertResultDto[]

  @ApiProperty({ description: 'Array of warning messages', type: [String] })
  warnings: string[]
}
