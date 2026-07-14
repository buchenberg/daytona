import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Grant every pre-existing backoffice user access to all Mali datasources.
 *
 * Mali datasources became a gated resource in this release (`maliDatasources`
 * on `backoffice_user.permissions`). New users default to no Mali access,
 * but users that already existed pre-rollout should keep the access they
 * effectively had before — which was unrestricted. So we set
 * `maliDatasources` to the full datasource list on every row that doesn't
 * already have the key (super-admins included, for explicitness, even
 * though `superAdmin: true` bypasses the check at runtime).
 *
 * Idempotent: only touches rows where the key is absent.
 */
const ALL_DATASOURCES = JSON.stringify(['database', 'clickhouse', 'grafana', 'opensearch', 'posthog', 'sandbox'])

export class GrantExistingUsersAllMaliDatasources1778707418156 implements MigrationInterface {
  name = 'GrantExistingUsersAllMaliDatasources1778707418156'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE backoffice_user
       SET permissions = permissions || jsonb_build_object('maliDatasources', $1::jsonb)
       WHERE permissions->'maliDatasources' IS NULL`,
      [ALL_DATASOURCES],
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE backoffice_user SET permissions = permissions - 'maliDatasources'`)
  }
}
