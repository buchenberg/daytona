/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, ValidateNested } from 'class-validator'
import { PaginationDto, SortDto, RangeDto } from '../../common/dto'

export class RegionQuotaFiltersDto {
  @ApiPropertyOptional({ description: 'Search by organization name or id (partial match)' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter by organization ID' })
  @IsOptional()
  @IsString()
  organizationId?: string

  @ApiPropertyOptional({ description: 'Filter by organization name' })
  @IsOptional()
  @IsString()
  organizationName?: string

  @ApiPropertyOptional({ description: 'Filter by region ID' })
  @IsOptional()
  @IsString()
  regionId?: string

  @ApiPropertyOptional({ description: 'Filter by CPU quota range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  cpuQuota?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by memory quota range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  memoryQuota?: RangeDto

  @ApiPropertyOptional({ description: 'Filter by disk quota range', type: RangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  diskQuota?: RangeDto
}

export class SearchRegionQuotaDto {
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

  @ApiPropertyOptional({ description: 'Filter options', type: RegionQuotaFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RegionQuotaFiltersDto)
  filters?: RegionQuotaFiltersDto
}
