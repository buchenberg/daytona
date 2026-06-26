/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { Secret } from '../entities/secret.entity'

@ApiSchema({ name: 'Secret' })
export class SecretDto {
  @ApiProperty({
    description: 'Secret ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string

  @ApiProperty({
    description: 'Secret name',
    example: 'MY_API_KEY',
  })
  name: string

  @ApiPropertyOptional({
    description: 'Optional description of the secret',
    example: 'API key for external service',
  })
  description?: string

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-31T12:00:00Z',
  })
  createdAt: Date

  @ApiProperty({
    description: 'Opaque placeholder token injected as env var value in sandboxes',
    example: 'dtn_secret_a7f3b2c1e9d4f6g8',
  })
  placeholder: string

  @ApiProperty({
    description: 'Allowed hosts this secret may be sent to',
    type: [String],
    example: ['api.anthropic.com'],
  })
  hosts: string[]

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-31T12:00:00Z',
  })
  updatedAt: Date

  static fromSecret(secret: Secret): SecretDto {
    const dto: SecretDto = {
      id: secret.id,
      name: secret.name,
      description: secret.description,
      placeholder: secret.placeholder,
      hosts: secret.hosts ?? [],
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    }

    return dto
  }
}
