/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'

export class UpdateSnapshotDto implements Partial<Snapshot> {
  @ApiPropertyOptional({ description: 'Snapshot name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @ApiPropertyOptional({ description: 'Hide from users' })
  @IsOptional()
  @IsBoolean()
  hideFromUsers?: boolean

  @ApiPropertyOptional({ description: 'General snapshot (available to all)' })
  @IsOptional()
  @IsBoolean()
  general?: boolean
}
