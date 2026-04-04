/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMaliMemoryAndExtensions1775100000000 implements MigrationInterface {
  name = 'AddMaliMemoryAndExtensions1775100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // mali_message extensions
    await queryRunner.query(`ALTER TABLE mali_message ADD COLUMN IF NOT EXISTS feedback JSONB`)
    await queryRunner.query(`ALTER TABLE mali_message ADD COLUMN IF NOT EXISTS compacted_at TIMESTAMPTZ`)
    await queryRunner.query(
      `ALTER TABLE mali_message ADD COLUMN IF NOT EXISTS message_type VARCHAR NOT NULL DEFAULT 'chat'`,
    )

    // mali_memory table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mali_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by VARCHAR NOT NULL,
        key VARCHAR NOT NULL,
        value TEXT NOT NULL,
        category VARCHAR NOT NULL DEFAULT 'finding',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_mali_memory_category ON mali_memory(category)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mali_memory`)
    await queryRunner.query(`ALTER TABLE mali_message DROP COLUMN IF EXISTS message_type`)
    await queryRunner.query(`ALTER TABLE mali_message DROP COLUMN IF EXISTS compacted_at`)
    await queryRunner.query(`ALTER TABLE mali_message DROP COLUMN IF EXISTS feedback`)
  }
}
