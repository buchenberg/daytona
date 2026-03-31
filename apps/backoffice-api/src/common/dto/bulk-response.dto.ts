/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class BulkUpdateResultErrorDto {
  @ApiProperty()
  code: string

  @ApiProperty()
  message: string
}

export class BulkUpdateResultDto {
  @ApiProperty({ description: 'Entity ID' })
  id: string

  @ApiProperty({ description: 'Whether the update was successful' })
  success: boolean

  @ApiPropertyOptional({ description: 'Updated entity data' })
  data?: any

  @ApiPropertyOptional({ type: BulkUpdateResultErrorDto, description: 'Error details if update failed' })
  error?: BulkUpdateResultErrorDto
}

export class BulkUpdateResponseDto {
  @ApiProperty({ description: 'Total number of entities processed' })
  totalProcessed: number

  @ApiProperty({ description: 'Number of successful updates' })
  successCount: number

  @ApiProperty({ description: 'Number of failed updates' })
  failureCount: number

  @ApiProperty({ type: [BulkUpdateResultDto], description: 'Individual update results' })
  results: BulkUpdateResultDto[]

  @ApiPropertyOptional({ type: [String], description: 'Warning messages' })
  warnings?: string[]
}
