/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'
import {
  Permissions,
  SandboxAction,
  SnapshotAction,
  RunnerAction,
  OrganizationAction,
  OrganizationUserAction,
  RegionQuotaAction,
  UserAction,
  AuditLogAction,
} from '../../common/permissions'

const ACTION_ENUM = ['read', 'write', 'write-bulk', 'delete'] as const

/**
 * OpenAPI-visible shape of the permissions JSONB stored on backoffice_user.
 * Regenerating the client from this DTO produces the TypeScript type the
 * dashboard imports from `@daytonaio/backoffice-api-client`.
 */
export class PermissionsDto implements Permissions {
  @ApiProperty({ required: false, description: 'Bypasses all permission checks.' })
  superAdmin?: boolean

  @ApiProperty({ required: false, enum: ACTION_ENUM, isArray: true })
  sandboxes?: SandboxAction[]

  @ApiProperty({ required: false, enum: ACTION_ENUM, isArray: true })
  snapshots?: SnapshotAction[]

  @ApiProperty({ required: false, enum: ACTION_ENUM, isArray: true })
  runners?: RunnerAction[]

  @ApiProperty({ required: false, enum: ACTION_ENUM, isArray: true })
  organizations?: OrganizationAction[]

  @ApiProperty({ required: false, enum: ACTION_ENUM, isArray: true })
  organizationUsers?: OrganizationUserAction[]

  @ApiProperty({ required: false, enum: ACTION_ENUM, isArray: true })
  regionQuotas?: RegionQuotaAction[]

  @ApiProperty({ required: false, enum: ['read', 'delete'], isArray: true })
  users?: UserAction[]

  @ApiProperty({ required: false, enum: ['read'], isArray: true })
  auditLogs?: AuditLogAction[]
}
