/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { IsOptional, IsString, IsUUID } from 'class-validator'

export class RotateApiKeyDto {
  @IsUUID()
  organizationId: string

  @IsOptional()
  @IsString()
  previousApiKeyName?: string

  @IsOptional()
  @IsString()
  newApiKeyName?: string
}
