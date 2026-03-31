/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { PaginationDto } from '../../common/dto/pagination.dto'
import { SortDto } from '../../common/dto/sort.dto'
import { UserFiltersDto } from './user-filters.dto'

export class SearchUsersDto {
  @ApiPropertyOptional({ type: UserFiltersDto, description: 'Filter criteria for users' })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserFiltersDto)
  filters?: UserFiltersDto

  @ApiPropertyOptional({ type: PaginationDto, description: 'Pagination options' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination?: PaginationDto

  @ApiPropertyOptional({ type: SortDto, description: 'Sorting options' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SortDto)
  sort?: SortDto
}
