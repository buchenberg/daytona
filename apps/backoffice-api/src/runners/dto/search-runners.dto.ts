/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsArray, IsEnum, IsBoolean, ValidateNested } from 'class-validator'
import { PaginationDto, SortDto, RangeDto } from '../../common/dto'
import { RunnerState } from '@api/sandbox/enums/runner-state.enum'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'

export class RunnerFiltersDto {
  @ApiPropertyOptional({ description: 'Search by domain or id (OR match)' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter by region' })
  @IsOptional()
  @IsString()
  region?: string

  @ApiPropertyOptional({ description: 'Filter by runner state', enum: RunnerState, isArray: true })
  @IsOptional()
  @IsEnum(RunnerState, { each: true })
  state?: RunnerState[]

  @ApiPropertyOptional({ description: 'Filter by runner class', enum: SandboxClass, isArray: true })
  @IsOptional()
  @IsEnum(SandboxClass, { each: true })
  class?: SandboxClass[]

  @ApiPropertyOptional({ description: 'Filter by unschedulable status' })
  @IsOptional()
  @IsBoolean()
  unschedulable?: boolean

  @ApiPropertyOptional({ description: 'Filter by CPU usage percentage range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  cpuUsage?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by memory usage percentage range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  memoryUsage?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by disk usage percentage range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  diskUsage?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by availability score range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  availabilityScore?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by last checked after date', type: Date })
  @IsOptional()
  @Type(() => Date)
  lastCheckedAfter?: Date

  @ApiPropertyOptional({ description: 'Filter by last checked before date', type: Date })
  @IsOptional()
  @Type(() => Date)
  lastCheckedBefore?: Date
}

export class SearchRunnerDto {
  @ApiPropertyOptional({ description: 'Pagination options', type: PaginationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination?: PaginationDto

  @ApiPropertyOptional({ description: 'Sort options', type: SortDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SortDto)
  sort?: SortDto

  @ApiPropertyOptional({ description: 'Filter options', type: RunnerFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RunnerFiltersDto)
  filters?: RunnerFiltersDto
}
