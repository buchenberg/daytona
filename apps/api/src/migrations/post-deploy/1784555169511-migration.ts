import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1784555169511 implements MigrationInterface {
  name = 'Migration1784555169511'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: not using CONCURRENTLY + skipping transactions because of reverting issue: https://github.com/typeorm/typeorm/issues/9981
    // Partial: only warm pool members carry a warmPoolId, so this stays tiny on the sandbox table
    // and every reader (member counts, orphan sweep, claim lookup) filters on a concrete id.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "sandbox_warmpoolid_idx" ON "sandbox" ("organizationId", "warmPoolId") WHERE "warmPoolId" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."sandbox_warmpoolid_idx"`)
  }
}
