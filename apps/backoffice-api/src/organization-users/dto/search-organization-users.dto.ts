/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsString, IsArray, IsEnum, ValidateNested } from 'class-validator'
import { PaginationDto, SortDto } from '../../common/dto'
import { OrganizationMemberRole } from '@api/organization/enums/organization-member-role.enum'

export class OrganizationUserFiltersDto {
  @ApiPropertyOptional({ description: 'Search by user ID or organization ID (partial match)' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter by organization ID' })
  @IsOptional()
  @IsString()
  organizationId?: string

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string

  @ApiPropertyOptional({ description: 'Filter by role', enum: OrganizationMemberRole, isArray: true })
  @IsOptional()
  @IsEnum(OrganizationMemberRole, { each: true })
  role?: OrganizationMemberRole[]

  @ApiPropertyOptional({ description: 'Filter by created after date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdAfter?: Date

  @ApiPropertyOptional({ description: 'Filter by created before date', type: Date })
  @IsOptional()
  @Type(() => Date)
  createdBefore?: Date
}

export class SearchOrganizationUserDto {
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

  @ApiPropertyOptional({ description: 'Filter options', type: OrganizationUserFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationUserFiltersDto)
  filters?: OrganizationUserFiltersDto
}
