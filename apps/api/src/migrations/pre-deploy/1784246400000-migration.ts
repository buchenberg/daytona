import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1784246400000 implements MigrationInterface {
  name = 'Migration1784246400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox_last_activity" ADD "lastActivitySource" text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox_last_activity" DROP COLUMN "lastActivitySource"`)
  }
}
