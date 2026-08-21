import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1783600089544 implements MigrationInterface {
  name = 'Migration1783600089544'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: not using CONCURRENTLY + skipping transactions because of reverting issue: https://github.com/typeorm/typeorm/issues/9981
    await queryRunner.query(
      `CREATE INDEX "sandbox_destroyed_cleanup_idx" ON "sandbox" ("updatedAt") WHERE "state" = 'destroyed'::sandbox_state_enum`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."sandbox_destroyed_cleanup_idx"`)
  }
}
