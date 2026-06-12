/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { IsOptional, IsString } from 'class-validator'

export class ProvisionStripeProjectsApiKeyDto {
  @IsString()
  userId: string

  @IsOptional()
  @IsString()
  apiKeyName?: string
}
