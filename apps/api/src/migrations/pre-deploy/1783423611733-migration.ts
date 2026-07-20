import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1783423611733 implements MigrationInterface {
  name = 'Migration1783423611733'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "warm_pool" ADD "organizationId" uuid`)
    await queryRunner.query(`ALTER TABLE "sandbox" ADD "warmPoolId" uuid`)
    await queryRunner.query(`ALTER TABLE "sandbox_usage_periods" ADD "warmPool" boolean NOT NULL DEFAULT false`)
    await queryRunner.query(`ALTER TABLE "sandbox_usage_periods_archive" ADD "warmPool" boolean NOT NULL DEFAULT false`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox_usage_periods_archive" DROP COLUMN "warmPool"`)
    await queryRunner.query(`ALTER TABLE "sandbox_usage_periods" DROP COLUMN "warmPool"`)
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "warmPoolId"`)
    await queryRunner.query(`ALTER TABLE "warm_pool" DROP COLUMN "organizationId"`)
  }
}
