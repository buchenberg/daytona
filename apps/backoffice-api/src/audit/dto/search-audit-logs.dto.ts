/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsNumber, Min, IsString, IsDate, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

export class AuditLogFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by actor email' })
  @IsOptional()
  @IsString()
  actorEmail?: string

  @ApiPropertyOptional({ description: 'Filter by action type' })
  @IsOptional()
  @IsString()
  action?: string

  @ApiPropertyOptional({ description: 'Filter by target type' })
  @IsOptional()
  @IsString()
  targetType?: string

  @ApiPropertyOptional({ description: 'Filter by target ID' })
  @IsOptional()
  @IsString()
  targetId?: string

  @ApiPropertyOptional({ description: 'Filter by start date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date

  @ApiPropertyOptional({ description: 'Filter by end date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date
}

export class SearchAuditLogsDto {
  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number

  @ApiPropertyOptional({ description: 'Number of items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  pageSize?: number

  @ApiPropertyOptional({ type: AuditLogFiltersDto, description: 'Filters to apply' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuditLogFiltersDto)
  filters?: AuditLogFiltersDto
}

export class AuditLogResponseDto {
  @ApiProperty({ description: 'Audit log ID' })
  id: string

  @ApiProperty({ description: 'Actor ID' })
  actorId: string

  @ApiProperty({ description: 'Actor email' })
  actorEmail: string

  @ApiProperty({ description: 'Action performed' })
  action: string

  @ApiPropertyOptional({ description: 'Target entity type' })
  targetType?: string

  @ApiPropertyOptional({ description: 'Target entity ID' })
  targetId?: string

  @ApiPropertyOptional({ description: 'HTTP status code' })
  statusCode?: number

  @ApiPropertyOptional({ description: 'Error message if any' })
  errorMessage?: string

  @ApiPropertyOptional({ description: 'IP address' })
  ipAddress?: string

  @ApiPropertyOptional({ description: 'User agent' })
  userAgent?: string

  @ApiPropertyOptional({ description: 'Additional metadata' })
  metadata?: Record<string, any>

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date
}

export class AuditLogSearchDataDto {
  @ApiProperty({ type: [AuditLogResponseDto], description: 'List of audit logs' })
  logs: AuditLogResponseDto[]
}

export class AuditLogSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: AuditLogSearchDataDto, description: 'Search results data' })
  data: AuditLogSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
