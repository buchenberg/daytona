/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { User } from '../entities/user.entity'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

export class UserResponseDto implements Partial<User> {
  @ApiProperty({ description: 'User ID' })
  id: string

  @ApiProperty({ description: 'User name' })
  name: string

  @ApiProperty({ description: 'User email' })
  email: string

  @ApiProperty({ description: 'Email verified status' })
  emailVerified: boolean

  @ApiProperty({ description: 'Created at' })
  createdAt: Date

  @ApiPropertyOptional({ description: 'Number of organizations user owns' })
  organizationsCount?: number
}

export class UserSearchDataDto {
  @ApiProperty({ type: [UserResponseDto], description: 'List of users' })
  users: UserResponseDto[]
}

export class UserSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: UserSearchDataDto, description: 'Search results data' })
  data: UserSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
