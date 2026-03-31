/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsArray, IsEnum, IsBoolean, ValidateNested } from 'class-validator'
import { PaginationDto, SortDto, RangeDto } from '../../common/dto'
import { SnapshotState } from '@api/sandbox/enums/snapshot-state.enum'

export class SnapshotFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by organization ID' })
  @IsOptional()
  @IsString()
  organizationId?: string

  @ApiPropertyOptional({ description: 'Filter by snapshot name (partial match)' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Filter by snapshot state', enum: SnapshotState, isArray: true })
  @IsOptional()
  @IsEnum(SnapshotState, { each: true })
  state?: SnapshotState[]

  @ApiPropertyOptional({ description: 'Filter by general snapshots' })
  @IsOptional()
  @IsBoolean()
  general?: boolean

  @ApiPropertyOptional({ description: 'Filter by hide from users status' })
  @IsOptional()
  @IsBoolean()
  hideFromUsers?: boolean

  @ApiPropertyOptional({ description: 'Filter by has error status' })
  @IsOptional()
  @IsBoolean()
  hasError?: boolean

  @ApiPropertyOptional({ description: 'Filter by size range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  size?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by created after date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdAfter?: Date

  @ApiPropertyOptional({ description: 'Filter by created before date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdBefore?: Date

  @ApiPropertyOptional({ description: 'Filter by last used after date', type: Date })
  @IsOptional()
  @Type(() => Date)
  lastUsedAfter?: Date

  @ApiPropertyOptional({ description: 'Filter by last used before date', type: Date })
  @IsOptional()
  @Type(() => Date)
  lastUsedBefore?: Date
}

export class SearchSnapshotDto {
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

  @ApiPropertyOptional({ description: 'Filter options', type: SnapshotFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SnapshotFiltersDto)
  filters?: SnapshotFiltersDto
}
