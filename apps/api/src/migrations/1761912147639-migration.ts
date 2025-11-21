/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1761912147639 implements MigrationInterface {
  name = 'Migration1761912147639'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "snapshot" ADD "ref" character varying;
      ALTER TABLE "snapshot" ADD "initialRunnerId" character varying;

      UPDATE "snapshot"
      SET
        "ref" = "internalName",
        "initialRunnerId" = "buildRunnerId";
    `)
    await queryRunner.query(`ALTER TABLE "snapshot" ADD "skipValidation" boolean NOT NULL DEFAULT false`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('snapshot', 'skipValidation')
    await queryRunner.dropColumn('snapshot', 'initialRunnerId')
    await queryRunner.dropColumn('snapshot', 'ref')
  }
}
