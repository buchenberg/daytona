import { MigrationInterface, QueryRunner } from 'typeorm'
import { GlobalOrganizationRolesIds } from '../../organization/constants/global-organization-roles.constant'

export class Migration1782151769655 implements MigrationInterface {
  name = 'Migration1782151769655'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the manage:secrets permission to the api key and organization role
    // permission enums, and grant it to the super-admin global role.
    //
    // This is intentionally dated after the manage:api_keys migration
    // (1782151769654): that migration recreates these enums from a fixed list,
    // so adding manage:secrets in an earlier migration would be dropped by it.
    // We recreate the enums (rather than ALTER TYPE ... ADD VALUE) so the grant
    // below can use the value in the same transaction — the fresh-DB
    // `migration:run:init` path runs every migration in one transaction, and
    // Postgres forbids using an ADD VALUE'd enum value in the transaction that
    // added it, whereas a value of a type created in the current transaction is
    // usable immediately.
    await queryRunner.query(`ALTER TYPE "public"."api_key_permissions_enum" RENAME TO "api_key_permissions_enum_old"`)
    await queryRunner.query(
      `CREATE TYPE "public"."api_key_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs', 'manage:api_keys', 'manage:secrets')`,
    )
    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "permissions" TYPE "public"."api_key_permissions_enum"[] USING "permissions"::"text"::"public"."api_key_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."api_key_permissions_enum_old"`)

    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME TO "organization_role_permissions_enum_old"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."organization_role_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs', 'manage:api_keys', 'manage:secrets')`,
    )
    await queryRunner.query(
      `ALTER TABLE "organization_role" ALTER COLUMN "permissions" TYPE "public"."organization_role_permissions_enum"[] USING "permissions"::"text"::"public"."organization_role_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."organization_role_permissions_enum_old"`)

    // grant the manage:secrets permission to the super admin global role
    await queryRunner.query(`
      UPDATE "organization_role"
      SET "permissions" = array_append("permissions", 'manage:secrets')
      WHERE "id" = '${GlobalOrganizationRolesIds.SUPER_ADMIN}'
        AND NOT ('manage:secrets' = ANY("permissions"))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // strip manage:secrets from any rows before reverting the enums to their
    // pre-state (which still includes manage:api_keys from migration 1782151769654)
    await queryRunner.query(
      `UPDATE "organization_role" SET "permissions" = array_remove("permissions", 'manage:secrets')`,
    )
    await queryRunner.query(`UPDATE "api_key" SET "permissions" = array_remove("permissions", 'manage:secrets')`)

    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME TO "organization_role_permissions_enum_old"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."organization_role_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs', 'manage:api_keys')`,
    )
    await queryRunner.query(
      `ALTER TABLE "organization_role" ALTER COLUMN "permissions" TYPE "public"."organization_role_permissions_enum"[] USING "permissions"::"text"::"public"."organization_role_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."organization_role_permissions_enum_old"`)

    await queryRunner.query(`ALTER TYPE "public"."api_key_permissions_enum" RENAME TO "api_key_permissions_enum_old"`)
    await queryRunner.query(
      `CREATE TYPE "public"."api_key_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs', 'manage:api_keys')`,
    )
    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "permissions" TYPE "public"."api_key_permissions_enum"[] USING "permissions"::"text"::"public"."api_key_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."api_key_permissions_enum_old"`)
  }
}
