/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsBoolean, IsEnum, IsString, IsNumber } from 'class-validator'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { RunnerState } from '@api/sandbox/enums/runner-state.enum'

export class UpdateRunnerDto implements Partial<Runner> {
  @ApiPropertyOptional({ description: 'Runner state', enum: RunnerState })
  @IsOptional()
  @IsEnum(RunnerState)
  state?: RunnerState

  @ApiPropertyOptional({ description: 'Unschedulable flag' })
  @IsOptional()
  @IsBoolean()
  unschedulable?: boolean

  @ApiPropertyOptional({ description: 'Draining flag' })
  @IsOptional()
  @IsBoolean()
  draining?: boolean

  @ApiPropertyOptional({ description: 'Runner region' })
  @IsOptional()
  @IsString()
  region?: string

  @ApiPropertyOptional({ description: 'CPU cores' })
  @IsOptional()
  @IsNumber()
  cpu?: number

  @ApiPropertyOptional({ description: 'Memory in GiB' })
  @IsOptional()
  @IsNumber()
  memoryGiB?: number

  @ApiPropertyOptional({ description: 'Disk in GiB' })
  @IsOptional()
  @IsNumber()
  diskGiB?: number
}
