import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1783605718293 implements MigrationInterface {
  name = 'Migration1783605718293'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" ADD "autoPauseInterval" integer NOT NULL DEFAULT '0'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "autoPauseInterval"`)
  }
}
