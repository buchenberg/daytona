/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional, Min, MaxLength } from 'class-validator'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { RunnerState } from '@api/sandbox/enums/runner-state.enum'

export class CreateRunnerDto {
  @ApiProperty({ description: 'Runner domain name', example: 'h1321.daytona.work' })
  @IsString()
  @MaxLength(255)
  domain: string

  @ApiProperty({ description: 'Runner API key' })
  @IsString()
  apiKey: string

  @ApiProperty({ description: 'Region ID', example: 'US' })
  @IsString()
  region: string

  @ApiProperty({ description: 'CPU cores', example: 64 })
  @IsNumber()
  @Min(1)
  cpu: number

  @ApiProperty({ description: 'Memory in GB', example: 768 })
  @IsNumber()
  @Min(1)
  memoryGiB: number

  @ApiProperty({ description: 'Disk in GB', example: 6900 })
  @IsNumber()
  @Min(1)
  diskGiB: number

  @ApiProperty({ description: 'Sandbox class', enum: SandboxClass, example: SandboxClass.SMALL })
  @IsEnum(SandboxClass)
  class: SandboxClass

  @ApiPropertyOptional({ description: 'GPU count', example: 0 })
  @IsNumber()
  @IsOptional()
  gpu?: number

  @ApiPropertyOptional({ description: 'GPU type', example: '' })
  @IsString()
  @IsOptional()
  gpuType?: string

  @ApiPropertyOptional({ description: 'Runner state', enum: RunnerState })
  @IsEnum(RunnerState)
  @IsOptional()
  state?: RunnerState

  @ApiPropertyOptional({ description: 'Is runner unschedulable', example: false })
  @IsBoolean()
  @IsOptional()
  unschedulable?: boolean
}
