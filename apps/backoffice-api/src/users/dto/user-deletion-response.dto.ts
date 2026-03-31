/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ExecutedActionsDto {
  @ApiProperty({ description: 'Number of sandboxes destroyed' })
  sandboxesDestroyed: number

  @ApiProperty({ description: 'Number of snapshots deactivated' })
  snapshotsDeactivated: number

  @ApiProperty({ description: 'Number of organizations anonymized' })
  organizationsAnonymized: number

  @ApiProperty({ description: 'Whether user was anonymized (ID changed from "userId" to "DELETED_userId")' })
  userAnonymized: boolean

  @ApiPropertyOptional({ description: 'Number of sandbox templates deleted' })
  sandboxTemplatesDeleted?: number

  @ApiPropertyOptional({ description: 'Number of API keys deleted' })
  apiKeysDeleted?: number

  @ApiPropertyOptional({ description: 'Number of organization memberships deleted' })
  membershipsDeleted?: number
}

export class ManualStepDto {
  @ApiProperty({ description: 'External service name' })
  service: string

  @ApiProperty({ description: 'Instruction for manual action' })
  instruction: string

  @ApiProperty({ description: 'Relevant identifier (user ID, customer ID, etc.)' })
  identifier: string
}

export class UserDeletionResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: ExecutedActionsDto, description: 'Actions executed by the service' })
  executedActions: ExecutedActionsDto

  @ApiProperty({ type: [ManualStepDto], description: 'Manual steps required in external services' })
  manualSteps: ManualStepDto[]

  @ApiProperty({ type: [String], description: 'Warnings or notices' })
  warnings: string[]
}
