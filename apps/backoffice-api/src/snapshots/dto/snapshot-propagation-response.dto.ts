/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class SnapshotPropagationStatusDto {
  @ApiProperty({ description: 'Number of runners with snapshot ready' })
  ready: number

  @ApiProperty({ description: 'Number of runners currently pulling snapshot' })
  pulling_snapshot: number

  @ApiProperty({ description: 'Number of runners with failed snapshot pull' })
  failed: number
}

export class SnapshotPropagationResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ description: 'Snapshot reference (internal name)' })
  snapshotRef: string

  @ApiProperty({ description: 'Target region' })
  region: string

  @ApiProperty({ description: 'Number of eligible runners found' })
  eligibleRunners: number

  @ApiProperty({ description: 'Number of records inserted (0 if dry run)' })
  insertedRecords: number

  @ApiProperty({ type: SnapshotPropagationStatusDto, description: 'Current propagation status by state' })
  currentStatus: SnapshotPropagationStatusDto

  @ApiProperty({ type: [String], description: 'Warnings or notices' })
  warnings: string[]
}
