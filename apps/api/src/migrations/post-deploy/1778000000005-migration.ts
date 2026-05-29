/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1778000000005 implements MigrationInterface {
  name = 'Migration1778000000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN IF EXISTS "androidDevice"`)
    await queryRunner.query(`ALTER TABLE "snapshot" DROP COLUMN IF EXISTS "androidDevice"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "snapshot" ADD "androidDevice" boolean NOT NULL DEFAULT false`)
    await queryRunner.query(`ALTER TABLE "sandbox" ADD "androidDevice" boolean NOT NULL DEFAULT false`)
  }
}
