/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { IsArray } from 'class-validator'

@ApiSchema({ name: 'UpdateSandboxSecrets' })
export class UpdateSandboxSecretsDto {
  @ApiProperty({
    description:
      'Secrets to mount in this sandbox, replacing the previously mounted set. Each entry maps an env var name to a vault secret name. Pass an empty array to detach all secrets.',
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    example: [{ ANTHROPIC_API_KEY: 'anthropic-prod' }, { DB_PASSWORD: 'DB_PASSWORD' }],
  })
  @IsArray()
  secrets: Record<string, string>[]
}
