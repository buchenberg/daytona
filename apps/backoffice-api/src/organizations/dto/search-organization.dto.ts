/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsBoolean, ValidateNested } from 'class-validator'
import { PaginationDto, SortDto } from '../../common/dto'

export class OrganizationFiltersDto {
  @ApiPropertyOptional({ description: 'Search by name or id (partial match)' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter by organization name (partial match)' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Filter by personal organizations' })
  @IsOptional()
  @IsBoolean()
  personal?: boolean

  @ApiPropertyOptional({ description: 'Filter by suspended status' })
  @IsOptional()
  @IsBoolean()
  suspended?: boolean

  @ApiPropertyOptional({ description: 'Filter by telemetry enabled' })
  @IsOptional()
  @IsBoolean()
  telemetryEnabled?: boolean

  @ApiPropertyOptional({ description: 'Filter by creator user ID' })
  @IsOptional()
  @IsString()
  createdBy?: string

  @ApiPropertyOptional({ description: 'Filter by created after date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdAfter?: Date

  @ApiPropertyOptional({ description: 'Filter by created before date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdBefore?: Date

  @ApiPropertyOptional({ description: 'Filter by suspended after date', type: Date })
  @IsOptional()
  @Type(() => Date)
  suspendedAfter?: Date

  @ApiPropertyOptional({ description: 'Filter by suspended before date', type: Date })
  @IsOptional()
  @Type(() => Date)
  suspendedBefore?: Date
}

export class SearchOrganizationDto {
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

  @ApiPropertyOptional({ description: 'Filter options', type: OrganizationFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationFiltersDto)
  filters?: OrganizationFiltersDto
}
