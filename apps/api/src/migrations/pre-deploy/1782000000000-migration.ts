import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1782000000000 implements MigrationInterface {
  name = 'Migration1782000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" ADD "gpu_type_preferences" text array`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "gpu_type_preferences"`)
  }
}
