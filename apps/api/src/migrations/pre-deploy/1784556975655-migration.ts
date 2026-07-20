import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1784556975655 implements MigrationInterface {
  name = 'Migration1784556975655'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-deploy: the unique index backs the create-race 409 handling, so it must exist before the
    // new code serves requests. warm_pool is tiny, so these builds are instant.
    await queryRunner.query(`CREATE INDEX "warm_pool_organizationid_idx" ON "warm_pool" ("organizationId")`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "warm_pool_org_snapshot_target_unique" ON "warm_pool" ("organizationId", "snapshot", "target") WHERE "organizationId" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."warm_pool_org_snapshot_target_unique"`)
    await queryRunner.query(`DROP INDEX "public"."warm_pool_organizationid_idx"`)
  }
}
