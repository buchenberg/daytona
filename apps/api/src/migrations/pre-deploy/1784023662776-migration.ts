import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1784023662776 implements MigrationInterface {
  name = 'Migration1784023662776'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" ADD "autoDestroyAt" TIMESTAMP WITH TIME ZONE`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "autoDestroyAt"`)
  }
}
