/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { IsOptional, IsString, IsEnum } from 'class-validator'
import { PageLimit } from '../../common/decorators/page-limit.decorator'

export enum SecretSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum SecretSortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

@ApiSchema({ name: 'ListSecretsQuery' })
export class ListSecretsQueryDto {
  @ApiProperty({
    name: 'cursor',
    description: 'Pagination cursor from a previous response',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsString()
  cursor?: string

  @PageLimit(100)
  limit = 100

  @ApiProperty({
    name: 'name',
    description: 'Filter by partial name match',
    required: false,
    type: String,
    example: 'MY_API_KEY',
  })
  @IsOptional()
  @IsString()
  name?: string

  @ApiProperty({
    name: 'sort',
    description: 'Field to sort by',
    required: false,
    enum: SecretSortField,
    default: SecretSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(SecretSortField)
  sort = SecretSortField.CREATED_AT

  @ApiProperty({
    name: 'order',
    description: 'Direction to sort by',
    required: false,
    enum: SecretSortDirection,
    default: SecretSortDirection.DESC,
  })
  @IsOptional()
  @IsEnum(SecretSortDirection)
  order = SecretSortDirection.DESC
}
