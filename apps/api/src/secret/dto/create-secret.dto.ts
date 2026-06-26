/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { IsString, IsOptional, IsArray, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'CreateSecret' })
export class CreateSecretDto {
  @ApiProperty({ description: 'Secret name (alphanumeric, hyphens, underscores)', example: 'MY_API_KEY' })
  @IsString()
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, {
    message:
      'Secret name must start with a letter or underscore and contain only alphanumeric characters, hyphens, and underscores',
  })
  name: string

  @ApiProperty({ description: 'Secret value' })
  @IsString()
  value: string

  @ApiPropertyOptional({ description: 'Optional description of the secret' })
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional({
    description: 'Allowed hosts this secret may be sent to',
    type: [String],
    example: ['api.anthropic.com'],
  })
  @IsOptional()
  @IsArray()
  @Matches(
    /^(\*\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+|[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(\.[a-zA-Z]{2,})+)$/,
    {
      each: true,
      message:
        'Each host must be a valid hostname (e.g. api.example.com) or wildcard (*.example.com). Omit hosts entirely for unrestricted access.',
    },
  )
  hosts?: string[]
}
