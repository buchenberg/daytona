/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'

export class AddToWarmPoolResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful', example: true })
  success: boolean

  @ApiProperty({ description: 'ID of the created warm pool entry', required: false })
  warmPoolId?: string

  @ApiProperty({ description: 'ID of the copied snapshot', required: false })
  copiedSnapshotId?: string

  @ApiProperty({ description: 'Error message if operation failed', required: false })
  error?: string
}
