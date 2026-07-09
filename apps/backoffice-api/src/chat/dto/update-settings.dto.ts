/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { DatasourceOverridesDto } from './datasource-overrides.dto'

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    type: DatasourceOverridesDto,
    description:
      'Per-user overrides and disables for Mali datasources (database, clickhouse, opensearch, grafana, posthog, sandbox). ' +
      'Secret fields are encrypted at rest.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatasourceOverridesDto)
  datasourceOverrides?: DatasourceOverridesDto
}
