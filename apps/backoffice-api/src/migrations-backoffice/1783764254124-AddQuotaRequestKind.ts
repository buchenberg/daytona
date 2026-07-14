import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Extend quota_bump_request so it can also track quota CREATE requests:
 * support-created region quotas with default limits that follow the same
 * approve / reject / expire lifecycle as quota updates.
 */
export class AddQuotaRequestKind1783764254124 implements MigrationInterface {
  name = 'AddQuotaRequestKind1783764254124'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quota_bump_request
        ADD COLUMN kind character varying NOT NULL DEFAULT 'update',
        ADD COLUMN gpu_delta integer NOT NULL DEFAULT 0,
        ADD COLUMN gpu_before integer NOT NULL DEFAULT 0,
        ADD COLUMN gpu_after integer NOT NULL DEFAULT 0
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quota_bump_request
        DROP COLUMN kind,
        DROP COLUMN gpu_delta,
        DROP COLUMN gpu_before,
        DROP COLUMN gpu_after
    `)
  }
}
