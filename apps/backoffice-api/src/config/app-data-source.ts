/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DataSource } from 'typeorm'
import { config } from './env'

// Import entities from main API app
// Note: Backoffice apps are internal admin tools that legitimately need access
// to the main API's data layer. Module boundary rules are relaxed for these imports.

// Sandbox entities
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SnapshotRunner } from '@api/sandbox/entities/snapshot-runner.entity'
import { SnapshotRegion } from '@api/sandbox/entities/snapshot-region.entity'
import { BuildInfo } from '@api/sandbox/entities/build-info.entity'

// Region entities
import { Region } from '@api/region/entities/region.entity'

// Organization entities
import { Organization } from '@api/organization/entities/organization.entity'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { OrganizationRole } from '@api/organization/entities/organization-role.entity'
import { OrganizationInvitation } from '@api/organization/entities/organization-invitation.entity'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  entitySkipConstructor: true,
  entities: [
    Sandbox,
    Runner,
    Snapshot,
    SnapshotRunner,
    SnapshotRegion,
    BuildInfo,
    Organization,
    OrganizationUser,
    OrganizationRole,
    OrganizationInvitation,
    RegionQuota,
    Region,
  ],
  synchronize: false,
  migrationsRun: false,
  logging: config.database.logging,
  ssl: config.database.tls.enabled,
  extra: config.database.tls.enabled
    ? { ssl: { rejectUnauthorized: config.database.tls.rejectUnauthorized } }
    : undefined,
})

export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize()
    console.log('✓ Database connection established')
  } catch (error) {
    console.error('✗ Database connection failed:', error)
    throw error
  }
}
