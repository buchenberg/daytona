import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1746354231722 implements MigrationInterface {
  name = 'Migration1746354231722'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "image" ADD "buildNodeId" character varying`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "image" DROP COLUMN "buildNodeId"`)
  }
}
