/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'

export class OrganizationPreviewDto {
  @ApiProperty({ description: 'Organization ID' })
  id: string

  @ApiProperty({ description: 'Organization name' })
  name: string

  @ApiProperty({ description: 'User role in organization' })
  role: string
}

export class SandboxPreviewDto {
  @ApiProperty({ description: 'Sandbox ID' })
  id: string

  @ApiProperty({ description: 'Sandbox name' })
  name: string

  @ApiProperty({ description: 'Sandbox state' })
  state: string
}

export class SnapshotPreviewDto {
  @ApiProperty({ description: 'Snapshot ID' })
  id: string

  @ApiProperty({ description: 'Snapshot name' })
  name: string

  @ApiProperty({ description: 'Snapshot state' })
  state: string
}

export class UserDeletionPreviewDto {
  @ApiProperty({ description: 'User ID' })
  userId: string

  @ApiProperty({ description: 'User email' })
  email: string

  @ApiProperty({ description: 'User name' })
  name: string

  @ApiProperty({ type: [OrganizationPreviewDto], description: 'Organizations where user is owner' })
  organizations: OrganizationPreviewDto[]

  @ApiProperty({ type: [SandboxPreviewDto], description: 'Sandboxes in owned organizations' })
  sandboxes: SandboxPreviewDto[]

  @ApiProperty({ type: [SnapshotPreviewDto], description: 'Snapshots in owned organizations' })
  snapshots: SnapshotPreviewDto[]

  @ApiProperty({ description: 'Number of API keys in owned organizations' })
  apiKeys: number

  @ApiProperty({ description: 'Number of sandbox templates in owned organizations' })
  sandboxTemplates: number

  @ApiProperty({ description: 'Estimated impact description' })
  estimatedImpact: string
}
