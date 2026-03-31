/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DataSource } from 'typeorm'
import { join } from 'path'
import { config } from './env'

import { AuditLog } from '../backoffice-db/entities/audit-log.entity'
import { BackofficeUser } from '../backoffice-db/entities/backoffice-user.entity'

export const BackofficeDataSource = new DataSource({
  type: 'postgres',
  host: config.backofficeDb.host,
  port: config.backofficeDb.port,
  username: config.backofficeDb.username,
  password: config.backofficeDb.password,
  database: config.backofficeDb.database,
  entities: [AuditLog, BackofficeUser],
  migrations: [join(__dirname, '../migrations-backoffice/**/*{.ts,.js}')],
  synchronize: false,
  migrationsRun: config.backofficeDb.migrationsRun,
  logging: config.backofficeDb.logging,
  ssl: config.backofficeDb.tls.enabled,
  extra: config.backofficeDb.tls.enabled
    ? { ssl: { rejectUnauthorized: config.backofficeDb.tls.rejectUnauthorized } }
    : undefined,
})
