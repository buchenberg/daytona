/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateSandboxDto } from './update-sandbox.dto'

export class PatchSandboxDto {
  @ApiProperty({ type: () => UpdateSandboxDto, description: 'Fields to update' })
  @ValidateNested()
  @Type(() => UpdateSandboxDto)
  updates: UpdateSandboxDto

  @ApiPropertyOptional({
    type: () => UpdateSandboxDto,
    description:
      'Expected current values for optimistic concurrency control. Update fails with 409 if any field does not match.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSandboxDto)
  preconditions?: UpdateSandboxDto
}
