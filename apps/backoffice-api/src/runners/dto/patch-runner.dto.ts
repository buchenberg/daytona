/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { UpdateRunnerDto } from './update-runner.dto'

export class PatchRunnerDto {
  @ApiProperty({ type: () => UpdateRunnerDto, description: 'Fields to update' })
  @ValidateNested()
  @Type(() => UpdateRunnerDto)
  updates: UpdateRunnerDto

  @ApiPropertyOptional({
    type: () => UpdateRunnerDto,
    description:
      'Expected current values for optimistic concurrency control. Update fails with 409 if any field does not match.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRunnerDto)
  preconditions?: UpdateRunnerDto
}
