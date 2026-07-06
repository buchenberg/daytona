/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1783382400000 implements MigrationInterface {
  name = 'Migration1783382400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organization" ALTER COLUMN "secret_quota" SET DEFAULT '10000'`)
    // Bump organizations still on the old default to the new one
    await queryRunner.query(`UPDATE "organization" SET "secret_quota" = 10000`)
    await queryRunner.query(`ALTER TABLE "organization" ADD "max_secrets_per_sandbox" integer NOT NULL DEFAULT '64'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organization" DROP COLUMN "max_secrets_per_sandbox"`)
    await queryRunner.query(`ALTER TABLE "organization" ALTER COLUMN "secret_quota" SET DEFAULT '200'`)
  }
}
