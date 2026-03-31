/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { Organization } from '@api/organization/entities/organization.entity'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

export class OrganizationResponseDto implements Partial<Organization> {
  @Expose()
  @ApiProperty({ description: 'Organization ID' })
  id: string

  @Expose()
  @ApiProperty({ description: 'Organization name' })
  name: string

  @Expose()
  @ApiProperty({ description: 'Created by user ID' })
  createdBy: string

  @Expose()
  @ApiProperty({ description: 'Is personal organization' })
  personal: boolean

  @Expose()
  @ApiProperty({ description: 'Telemetry enabled' })
  telemetryEnabled: boolean

  @Expose()
  @ApiProperty({ description: 'Is suspended' })
  suspended: boolean

  @Expose()
  @ApiPropertyOptional({ description: 'Suspended at' })
  suspendedAt?: Date

  @Expose()
  @ApiProperty({ description: 'Created at' })
  createdAt: Date

  @Expose()
  @ApiPropertyOptional({ description: 'Default region ID' })
  defaultRegionId?: string

  @Expose()
  @ApiProperty({ description: 'Max CPU per sandbox' })
  maxCpuPerSandbox: number

  @Expose()
  @ApiProperty({ description: 'Max memory per sandbox in GB' })
  maxMemoryPerSandbox: number

  @Expose()
  @ApiProperty({ description: 'Max disk per sandbox in GB' })
  maxDiskPerSandbox: number

  @Expose()
  @ApiProperty({ description: 'Max snapshot size in GB' })
  maxSnapshotSize: number

  @Expose()
  @ApiProperty({ description: 'Snapshot quota in GB' })
  snapshotQuota: number

  @Expose()
  @ApiProperty({ description: 'Volume quota in GB' })
  volumeQuota: number

  @Expose()
  @ApiProperty({ description: 'Limit network egress for sandboxes' })
  sandboxLimitedNetworkEgress: boolean

  @Expose()
  @ApiPropertyOptional({ description: 'Suspended until date' })
  suspendedUntil?: Date

  @Expose()
  @ApiPropertyOptional({ description: 'Suspension reason' })
  suspensionReason?: string

  @Expose()
  @ApiProperty({ description: 'Suspension cleanup grace period in hours' })
  suspensionCleanupGracePeriodHours: number

  @Expose()
  @ApiPropertyOptional({ description: 'Authenticated rate limit' })
  authenticatedRateLimit: number | null

  @Expose()
  @ApiPropertyOptional({ description: 'Sandbox create rate limit' })
  sandboxCreateRateLimit: number | null

  @Expose()
  @ApiPropertyOptional({ description: 'Sandbox lifecycle rate limit' })
  sandboxLifecycleRateLimit: number | null

  @Expose()
  @ApiPropertyOptional({ description: 'Authenticated rate limit TTL in seconds' })
  authenticatedRateLimitTtlSeconds: number | null

  @Expose()
  @ApiPropertyOptional({ description: 'Sandbox create rate limit TTL in seconds' })
  sandboxCreateRateLimitTtlSeconds: number | null

  @Expose()
  @ApiPropertyOptional({ description: 'Sandbox lifecycle rate limit TTL in seconds' })
  sandboxLifecycleRateLimitTtlSeconds: number | null
}

export class OrganizationSearchDataDto {
  @ApiProperty({ type: [OrganizationResponseDto], description: 'List of organizations' })
  organizations: OrganizationResponseDto[]
}

export class OrganizationSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: OrganizationSearchDataDto, description: 'Search results data' })
  data: OrganizationSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
