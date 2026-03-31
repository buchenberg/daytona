/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsArray, IsEnum, IsBoolean, ValidateNested } from 'class-validator'
import { PaginationDto, SortDto, RangeDto } from '../../common/dto'
import { SandboxState } from '@api/sandbox/enums/sandbox-state.enum'

export class SandboxFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by specific sandbox IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sandboxIds?: string[]

  @ApiPropertyOptional({ description: 'Filter by organization ID' })
  @IsOptional()
  @IsString()
  organizationId?: string

  @ApiPropertyOptional({ description: 'Search by id (partial match)' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter by region' })
  @IsOptional()
  @IsString()
  region?: string

  @ApiPropertyOptional({ description: 'Filter by sandbox states', enum: SandboxState, isArray: true })
  @IsOptional()
  @IsEnum(SandboxState, { each: true })
  state?: SandboxState[]

  @ApiPropertyOptional({ description: 'Exclude specific states', enum: SandboxState, isArray: true })
  @IsOptional()
  @IsEnum(SandboxState, { each: true })
  excludeStates?: SandboxState[]

  @ApiPropertyOptional({ description: 'Filter by runner ID' })
  @IsOptional()
  @IsString()
  runnerId?: string

  @ApiPropertyOptional({ description: 'Filter by public status' })
  @IsOptional()
  @IsBoolean()
  public?: boolean

  @ApiPropertyOptional({ description: 'Only include sandboxes with errors' })
  @IsOptional()
  @IsBoolean()
  errorOnly?: boolean

  @ApiPropertyOptional({ description: 'Filter by has error status' })
  @IsOptional()
  @IsBoolean()
  hasError?: boolean

  @ApiPropertyOptional({ description: 'Filter by CPU range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  cpu?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by memory range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  memory?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by disk range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  disk?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by created after date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdAfter?: Date

  @ApiPropertyOptional({ description: 'Filter by created before date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdBefore?: Date
}

export class SearchSandboxDto {
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

  @ApiPropertyOptional({ description: 'Filter options', type: SandboxFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SandboxFiltersDto)
  filters?: SandboxFiltersDto
}
