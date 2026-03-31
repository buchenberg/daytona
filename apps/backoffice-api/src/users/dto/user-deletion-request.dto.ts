/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class UserDeletionOptionsDto {
  @ApiPropertyOptional({ description: 'Delete sandbox templates (hard delete)', default: false })
  @IsOptional()
  @IsBoolean()
  deleteSandboxTemplates?: boolean

  @ApiPropertyOptional({ description: 'Delete API keys (hard delete)', default: false })
  @IsOptional()
  @IsBoolean()
  deleteApiKeys?: boolean

  @ApiPropertyOptional({ description: 'Delete organization memberships (hard delete)', default: false })
  @IsOptional()
  @IsBoolean()
  deleteOrgMemberships?: boolean
}

export class UserDeletionRequestDto {
  @ApiProperty({ type: UserDeletionOptionsDto, description: 'Deletion options for destructive actions' })
  @ValidateNested()
  @Type(() => UserDeletionOptionsDto)
  options: UserDeletionOptionsDto
}
