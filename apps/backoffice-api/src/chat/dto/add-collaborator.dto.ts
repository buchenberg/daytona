/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsIn } from 'class-validator'

export class AddCollaboratorDto {
  @ApiProperty({ description: 'User ID to add as collaborator' })
  @IsString()
  userId: string

  @ApiProperty({ description: 'Access mode', enum: ['read', 'write'] })
  @IsIn(['read', 'write'])
  mode: 'read' | 'write'
}
