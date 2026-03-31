/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator'
import { Organization } from '@api/organization/entities/organization.entity'

/**
 * DTO for updating Organization with type-safe coupling
 * Implements Partial<Organization> to ensure fields match the entity
 */
export class UpdateOrganizationDto implements Partial<Organization> {
  @ApiPropertyOptional({ description: 'Organization name' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Is organization suspended' })
  @IsOptional()
  @IsBoolean()
  suspended?: boolean

  @ApiPropertyOptional({ description: 'Suspension end date', type: Date })
  @IsOptional()
  suspendedUntil?: Date

  @ApiPropertyOptional({ description: 'Default region ID' })
  @IsOptional()
  @IsString()
  defaultRegionId?: string

  @ApiPropertyOptional({ description: 'Telemetry enabled' })
  @IsOptional()
  @IsBoolean()
  telemetryEnabled?: boolean

  @ApiPropertyOptional({ description: 'Max CPU per sandbox' })
  @IsOptional()
  @IsNumber()
  maxCpuPerSandbox?: number

  @ApiPropertyOptional({ description: 'Max memory per sandbox in GB' })
  @IsOptional()
  @IsNumber()
  maxMemoryPerSandbox?: number

  @ApiPropertyOptional({ description: 'Max disk per sandbox in GB' })
  @IsOptional()
  @IsNumber()
  maxDiskPerSandbox?: number

  @ApiPropertyOptional({ description: 'Max snapshot size in GB' })
  @IsOptional()
  @IsNumber()
  maxSnapshotSize?: number

  @ApiPropertyOptional({ description: 'Snapshot quota in GB' })
  @IsOptional()
  @IsNumber()
  snapshotQuota?: number

  @ApiPropertyOptional({ description: 'Volume quota in GB' })
  @IsOptional()
  @IsNumber()
  volumeQuota?: number

  @ApiPropertyOptional({ description: 'Limit network egress for sandboxes' })
  @IsOptional()
  @IsBoolean()
  sandboxLimitedNetworkEgress?: boolean
}
