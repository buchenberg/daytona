import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1784556975656 implements MigrationInterface {
  name = 'Migration1784556975656'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "region" ADD "snapshotEvictionDiskThreshold" integer`)
    await queryRunner.query(`ALTER TABLE "region" ADD "snapshotEvictionDiskThresholdGpu" integer`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "snapshotEvictionDiskThresholdGpu"`)
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "snapshotEvictionDiskThreshold"`)
  }
}
