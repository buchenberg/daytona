/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateConversationDto {
  @ApiPropertyOptional({ description: 'New conversation title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string

  @ApiPropertyOptional({ description: 'Pin the conversation to exempt it from retention autodeletion' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean
}
