import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1781000000000 implements MigrationInterface {
  name = 'Migration1781000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "max_concurrent_snapshot_processing" integer NOT NULL DEFAULT 10`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organization" DROP COLUMN IF EXISTS "max_concurrent_snapshot_processing"`)
  }
}
