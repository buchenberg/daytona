/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Retention support: `pinned` exempts a conversation from autodeletion and
 * `input_tokens` records the latest round's context size for the sidebar.
 * Also enforces unique memory keys, which the upsert-by-key API assumed.
 */
export class AddMaliPinningUsageAndUniqueMemoryKey1783699430518 implements MigrationInterface {
  name = 'AddMaliPinningUsageAndUniqueMemoryKey1783699430518'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mali_conversation ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE`)
    await queryRunner.query(`ALTER TABLE mali_conversation ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0`)

    // Drop older duplicates (keep the most recently updated) before adding the constraint.
    await queryRunner.query(`
      DELETE FROM mali_memory a USING mali_memory b
      WHERE a.key = b.key
        AND (a.updated_at, a.id) < (b.updated_at, b.id)
    `)
    await queryRunner.query(`ALTER TABLE mali_memory ADD CONSTRAINT uq_mali_memory_key UNIQUE (key)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mali_memory DROP CONSTRAINT uq_mali_memory_key`)
    await queryRunner.query(`ALTER TABLE mali_conversation DROP COLUMN input_tokens`)
    await queryRunner.query(`ALTER TABLE mali_conversation DROP COLUMN pinned`)
  }
}
