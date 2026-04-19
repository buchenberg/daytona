/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Replace the coarse `role` column on `backoffice_user` with a fine-grained
 * JSONB `permissions` column.
 *
 *   role='admin'   →  {"superAdmin": true}
 *   role='viewer'  →  {"sandboxes": ["read"], "snapshots": ["read"], ...}
 *   anything else  →  {}  (least privilege)
 *
 * The old `role` column is dropped once values are copied over.
 */
export class AddBackofficeUserPermissions1776000000000 implements MigrationInterface {
  name = 'AddBackofficeUserPermissions1776000000000'

  private static readonly VIEWER_JSON = JSON.stringify({
    sandboxes: ['read'],
    snapshots: ['read'],
    runners: ['read'],
    organizations: ['read'],
    organizationUsers: ['read'],
    regionQuotas: ['read'],
    users: ['read'],
    auditLogs: ['read'],
  })

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE backoffice_user
      ADD COLUMN permissions JSONB NOT NULL DEFAULT '{}'::jsonb
    `)

    await queryRunner.query(
      `UPDATE backoffice_user SET permissions = '{"superAdmin": true}'::jsonb WHERE role = 'admin'`,
    )
    await queryRunner.query(`UPDATE backoffice_user SET permissions = $1::jsonb WHERE role = 'viewer'`, [
      AddBackofficeUserPermissions1776000000000.VIEWER_JSON,
    ])

    await queryRunner.query(`ALTER TABLE backoffice_user DROP COLUMN role`)

    await queryRunner.query(
      `CREATE INDEX idx_backoffice_user_super_admin ON backoffice_user ((permissions->>'superAdmin'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_backoffice_user_super_admin`)
    await queryRunner.query(`ALTER TABLE backoffice_user ADD COLUMN role VARCHAR(50) DEFAULT 'admin'`)
    await queryRunner.query(
      `UPDATE backoffice_user SET role = 'admin' WHERE (permissions->>'superAdmin')::boolean = true`,
    )
    await queryRunner.query(
      `UPDATE backoffice_user SET role = 'viewer' WHERE (permissions->>'superAdmin') IS NULL AND permissions::text <> '{}'`,
    )
    await queryRunner.query(`ALTER TABLE backoffice_user DROP COLUMN permissions`)
  }
}
