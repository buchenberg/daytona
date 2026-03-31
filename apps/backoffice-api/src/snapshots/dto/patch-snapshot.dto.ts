/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateSnapshotDto } from './update-snapshot.dto'

export class PatchSnapshotDto {
  @ApiProperty({ type: () => UpdateSnapshotDto, description: 'Fields to update' })
  @ValidateNested()
  @Type(() => UpdateSnapshotDto)
  updates: UpdateSnapshotDto

  @ApiPropertyOptional({
    type: () => UpdateSnapshotDto,
    description:
      'Expected current values for optimistic concurrency control. Update fails with 409 if any field does not match.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSnapshotDto)
  preconditions?: UpdateSnapshotDto
}
