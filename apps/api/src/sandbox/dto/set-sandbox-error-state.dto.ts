/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'

export class SetSandboxErrorStateDto {
  @IsString()
  @MinLength(1)
  errorReason: string

  @IsOptional()
  @IsBoolean()
  recoverable?: boolean
}
