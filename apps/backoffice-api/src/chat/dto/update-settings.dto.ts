/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Daytona API key for sandbox tools' })
  @IsOptional()
  @IsString()
  daytonaApiKey?: string

  @ApiPropertyOptional({ description: 'GitHub repository URL for automated PRs' })
  @IsOptional()
  @IsString()
  githubRepoUrl?: string

  @ApiPropertyOptional({ description: 'GitHub Personal Access Token' })
  @IsOptional()
  @IsString()
  githubPat?: string
}
