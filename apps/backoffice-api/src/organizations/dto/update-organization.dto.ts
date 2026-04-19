/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean, IsNumber, IsInt, Min, ValidateIf } from 'class-validator'
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

  @ApiPropertyOptional({
    description: 'Snapshot deactivation timeout in minutes (default 20160 = 14 days). Min 1.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  snapshotDeactivationTimeoutMinutes?: number

  @ApiPropertyOptional({
    description: 'Authenticated request rate limit (requests per TTL window). null = use global default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  authenticatedRateLimit?: number | null

  @ApiPropertyOptional({
    description: 'Sandbox create rate limit. null = use global default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  sandboxCreateRateLimit?: number | null

  @ApiPropertyOptional({
    description: 'Sandbox lifecycle (start/stop/etc) rate limit. null = use global default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  sandboxLifecycleRateLimit?: number | null

  @ApiPropertyOptional({
    description: 'TTL window (seconds) for authenticatedRateLimit. null = use global default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  authenticatedRateLimitTtlSeconds?: number | null

  @ApiPropertyOptional({
    description: 'TTL window (seconds) for sandboxCreateRateLimit. null = use global default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  sandboxCreateRateLimitTtlSeconds?: number | null

  @ApiPropertyOptional({
    description: 'TTL window (seconds) for sandboxLifecycleRateLimit. null = use global default.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  sandboxLifecycleRateLimitTtlSeconds?: number | null
}
