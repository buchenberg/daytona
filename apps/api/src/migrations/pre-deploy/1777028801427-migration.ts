/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1777028801427 implements MigrationInterface {
  name = 'Migration1777028801427'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "email_domain_whitelist" ("id" SERIAL NOT NULL, "domain" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "email_domain_whitelist_domain_unique" UNIQUE ("domain"), CONSTRAINT "email_domain_whitelist_id_pk" PRIMARY KEY ("id"))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_domain_whitelist"`)
  }
}
