/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * _Contract_ migration for sandbox V2 refactor
 */
export class Migration1768393015162 implements MigrationInterface {
  name = 'Migration1768393015162'

  public async up(queryRunner: QueryRunner): Promise<void> {
    /**
     * ------------------------------------------------------------------------
     * Section 1: drop obsolete region.hidden field
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "hidden"`)

    /**
     * ------------------------------------------------------------------------
     * Section 2: drop obsolete runner index (replaced by runner_state_unschedulable_region_index)
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_runner_state_unschedulable"`)

    /**
     * ------------------------------------------------------------------------
     * Section 3: drop obsolete runner version field
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" DROP COLUMN "version"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /**
     * ------------------------------------------------------------------------
     * Revert Section 1
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "region" ADD "hidden" boolean NOT NULL DEFAULT false`)
    await queryRunner.query(`UPDATE "region" SET "hidden" = true WHERE "regionType" = 'dedicated'`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 2
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`CREATE INDEX "idx_runner_state_unschedulable" ON "runner" ("state", "unschedulable")`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 3
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ADD "version" character varying NOT NULL DEFAULT '0'`)
    await queryRunner.query(`UPDATE "runner" SET "version" = "apiVersion"`)
  }
}
