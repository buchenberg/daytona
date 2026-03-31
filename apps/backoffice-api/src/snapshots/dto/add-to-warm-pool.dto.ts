/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsString, IsIn } from 'class-validator'

export class AddToWarmPoolDto {
  @ApiProperty({ description: 'Pool number', example: 20 })
  @IsNumber()
  pool: number

  @ApiProperty({ description: 'Target region', enum: ['us', 'eu'], example: 'us' })
  @IsString()
  @IsIn(['us', 'eu'])
  target: string
}
