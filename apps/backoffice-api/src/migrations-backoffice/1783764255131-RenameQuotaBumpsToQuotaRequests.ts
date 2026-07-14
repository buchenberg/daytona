import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Rename the "quota bump" feature to "quota requests" (kinds: update | create):
 * the tracking table, its partial unique index, and the `regionQuotas:bump`
 * permission action (now `request`). Historical audit_log rows keep their old
 * action strings — audit history is not rewritten.
 *
 * Sessions issued before this migration still carry `bump` in their JWT, so
 * requesters must log in again to pick up the renamed permission.
 */
export class RenameQuotaBumpsToQuotaRequests1783764255131 implements MigrationInterface {
  name = 'RenameQuotaBumpsToQuotaRequests1783764255131'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE quota_bump_request RENAME TO quota_request`)
    await queryRunner.query(`ALTER INDEX idx_quota_bump_request_one_pending RENAME TO idx_quota_request_one_pending`)
    await queryRunner.query(`
      UPDATE backoffice_user
      SET permissions = jsonb_set(
        permissions,
        '{regionQuotas}',
        (SELECT jsonb_agg(CASE WHEN action = 'bump' THEN 'request' ELSE action END)
         FROM jsonb_array_elements_text(permissions->'regionQuotas') AS action)
      )
      WHERE permissions->'regionQuotas' ? 'bump'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE backoffice_user
      SET permissions = jsonb_set(
        permissions,
        '{regionQuotas}',
        (SELECT jsonb_agg(CASE WHEN action = 'request' THEN 'bump' ELSE action END)
         FROM jsonb_array_elements_text(permissions->'regionQuotas') AS action)
      )
      WHERE permissions->'regionQuotas' ? 'request'
    `)
    await queryRunner.query(`ALTER INDEX idx_quota_request_one_pending RENAME TO idx_quota_bump_request_one_pending`)
    await queryRunner.query(`ALTER TABLE quota_request RENAME TO quota_bump_request`)
  }
}
