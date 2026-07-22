import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1784128102773 implements MigrationInterface {
  name = 'Migration1784128102773'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" ADD "signingKey" character varying`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "signingKey"`)
  }
}
