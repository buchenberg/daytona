import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1783593815161 implements MigrationInterface {
  name = 'Migration1783593815161'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" ADD "includesMemory" boolean NOT NULL DEFAULT false`)
    // Backfill existing memory-preserving sandboxes. Without this, paused sandboxes would default to
    // false and later be surfaced as stopped/starting (instead of paused/resuming) once evicted/archived.
    await queryRunner.query(
      `UPDATE "sandbox" SET "includesMemory" = true WHERE "state" IN ('paused', 'pausing', 'resuming')`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "includesMemory"`)
  }
}
