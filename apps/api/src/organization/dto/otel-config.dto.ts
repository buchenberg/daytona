/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'OtelConfig' })
export class OtelConfigDto {
  @ApiProperty({
    description: 'Endpoint',
  })
  endpoint: string

  @ApiProperty({
    description: 'Headers',
    example: {
      'x-api-key': 'my-api-key',
    },
    nullable: true,
    required: false,
    additionalProperties: { type: 'string' },
  })
  headers?: Record<string, string>

  @ApiProperty({
    description: 'Organization ID the config belongs to',
    required: false,
  })
  organizationId?: string
}
