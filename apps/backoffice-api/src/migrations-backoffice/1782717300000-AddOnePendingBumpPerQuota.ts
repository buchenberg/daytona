import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Enforce at most one PENDING bump per region_quota (organization, region,
 * sandbox class). This makes the snapshot-based revert unambiguous and closes the
 * race where a second request reads the quota between the first request applying
 * its increase and persisting its tracking row.
 */
export class AddOnePendingBumpPerQuota1782717300000 implements MigrationInterface {
  name = 'AddOnePendingBumpPerQuota1782717300000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_quota_bump_request_one_pending
      ON quota_bump_request (organization_id, region_id, sandbox_class)
      WHERE status = 'pending'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_quota_bump_request_one_pending`)
  }
}
