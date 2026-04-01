/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsUUID } from 'class-validator'

export class ChatRequestDto {
  @ApiPropertyOptional({ description: 'Conversation ID to continue, or omit to create new' })
  @IsOptional()
  @IsUUID()
  conversationId?: string

  @ApiProperty({ description: 'User message text' })
  @IsString()
  message: string
}

export class StopChatRequestDto {
  @ApiProperty({ description: 'Conversation ID to stop streaming' })
  @IsUUID()
  conversationId: string
}

export class ContinueChatRequestDto {
  @ApiProperty({ description: 'Conversation ID to continue after max_rounds' })
  @IsUUID()
  conversationId: string
}
