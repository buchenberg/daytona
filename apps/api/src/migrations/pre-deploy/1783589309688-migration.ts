import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1783589309688 implements MigrationInterface {
  name = 'Migration1783589309688'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: not using CONCURRENTLY + skipping transactions because of reverting issue: https://github.com/typeorm/typeorm/issues/9981
    await queryRunner.query(
      `CREATE INDEX "sandbox_org_region_class_active_idx" ON "sandbox" ("organizationId", "region", "sandboxClass") WHERE "state" <> ALL (ARRAY['destroyed'::sandbox_state_enum, 'error'::sandbox_state_enum, 'build_failed'::sandbox_state_enum, 'archived'::sandbox_state_enum])`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."sandbox_org_region_class_active_idx"`)
  }
}
