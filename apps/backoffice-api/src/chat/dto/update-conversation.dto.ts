/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'

export class UpdateConversationDto {
  @ApiProperty({ description: 'New conversation title' })
  @IsString()
  @MaxLength(200)
  title: string
}
