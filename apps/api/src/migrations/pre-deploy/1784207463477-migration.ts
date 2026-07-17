import { MigrationInterface, QueryRunner } from 'typeorm'

//  on prod this index must be created manually with CREATE INDEX CONCURRENTLY
//  and this migration marked as executed without running it
export class Migration1784207463477 implements MigrationInterface {
  name = 'Migration1784207463477'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "sandbox_autoDestroyAt_index" ON "sandbox" ("autoDestroyAt") WHERE "autoDestroyAt" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "sandbox_autoDestroyAt_index"`)
  }
}
