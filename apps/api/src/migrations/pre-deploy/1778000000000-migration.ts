/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1778000000000 implements MigrationInterface {
  name = 'Migration1778000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(`ALTER TABLE "sandbox" ADD "sandboxClass" character varying NOT NULL DEFAULT 'container'`)
    // await queryRunner.query(`ALTER TABLE "snapshot" ADD "sandboxClass" character varying NOT NULL DEFAULT 'container'`)
    // await queryRunner.query(`ALTER TABLE "runner" ADD "sandboxClass" character varying NOT NULL DEFAULT 'container'`)
    for (const table of ['sandbox', 'snapshot', 'runner']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "sandboxClass_new" character varying NOT NULL DEFAULT 'container'`,
      )
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "sandboxClass"`)
      await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "sandboxClass_new" TO "sandboxClass"`)
    }

    await queryRunner.query(`
      UPDATE "snapshot" SET "sandboxClass" = 'android' WHERE id IN (
        '369dc9ad-384a-4fed-9285-fac22b304144',
        '2034a843-f585-4e05-a0e1-b0b65aa94262',
        'dbcf689b-3e62-4135-9658-a2be071a30ee',
        '97194b0d-79f8-47f1-96b4-a071afb47125',
        '840f30d3-6c0f-431a-8cab-b840554f0c1d',
        '162bee35-28bc-4ab5-97b2-71e8afd92bfb',
        '9a6c76a7-a985-49db-86f1-6f1e9acce0d8',
        'fdd5bf9a-4378-4fb9-b2d8-e072083c86b3',
        '1cd9bd81-003d-49a6-9bdd-88fa04ee1509',
        '7bcdba9b-86de-47ad-8e55-37cbe4141442'
      )
    `)

    await queryRunner.query(`
      UPDATE "snapshot" SET "sandboxClass" = 'linux-vm' WHERE id IN (
        '48817e01-4ee5-4eb2-9284-8b2d7428dd22',
        'd025c1cf-329d-42d2-8f9e-35aa80907785',
        'a3b2074e-b09d-43bb-9fa7-bd82b491272a',
        'f627ccfa-c57c-40b6-9301-84020b322925'
      )
    `)

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sandbox_class_enum_new"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sandbox_class_enum"`)

    await queryRunner.query(
      `ALTER TABLE "sandbox_usage_periods" ADD "sandboxClass" character varying NOT NULL DEFAULT 'container'`,
    )
    await queryRunner.query(
      `ALTER TABLE "sandbox_usage_periods_archive" ADD "sandboxClass" character varying NOT NULL DEFAULT 'container'`,
    )
    await queryRunner.query(
      `ALTER TABLE "region_quota" ADD "sandboxClass" character varying NOT NULL DEFAULT 'container'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "region_quota" DROP COLUMN "sandboxClass"`)
    await queryRunner.query(`ALTER TABLE "sandbox_usage_periods_archive" DROP COLUMN "sandboxClass"`)
    await queryRunner.query(`ALTER TABLE "sandbox_usage_periods" DROP COLUMN "sandboxClass"`)
    await queryRunner.query(`ALTER TABLE "runner" DROP COLUMN "sandboxClass"`)
    await queryRunner.query(`ALTER TABLE "snapshot" DROP COLUMN "sandboxClass"`)
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "sandboxClass"`)
  }
}
