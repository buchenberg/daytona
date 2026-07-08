/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'
import { GlobalOrganizationRolesIds } from '../../organization/constants/global-organization-roles.constant'
import { OrganizationResourcePermission } from '../../organization/enums/organization-resource-permission.enum'

export class Migration1783507887246 implements MigrationInterface {
  name = 'Migration1783507887246'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Recreate the permission enums (rather than ALTER TYPE ... ADD VALUE) so the new
    // value is usable later in this same transaction on the migration:run:init path.
    await queryRunner.query(`ALTER TYPE "public"."api_key_permissions_enum" RENAME TO "api_key_permissions_enum_old"`)
    await queryRunner.query(
      `CREATE TYPE "public"."api_key_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs', 'manage:api_keys', 'manage:secrets', 'read:limits')`,
    )
    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "permissions" TYPE "public"."api_key_permissions_enum"[] USING "permissions"::"text"::"public"."api_key_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."api_key_permissions_enum_old"`)

    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME TO "organization_role_permissions_enum_old"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."organization_role_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs', 'manage:api_keys', 'manage:secrets', 'read:limits')`,
    )
    await queryRunner.query(
      `ALTER TABLE "organization_role" ALTER COLUMN "permissions" TYPE "public"."organization_role_permissions_enum"[] USING "permissions"::"text"::"public"."organization_role_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."organization_role_permissions_enum_old"`)

    await queryRunner.query(`
      INSERT INTO "organization_role"
        ("id", "name", "description", "permissions", "isGlobal")
      VALUES
        (
          '${GlobalOrganizationRolesIds.LIMITS_VIEWER}',
          'Limits Viewer',
          'Grants read-only access to the organization''s usage and limits',
          ARRAY['${OrganizationResourcePermission.READ_LIMITS}']::organization_role_permissions_enum[],
          TRUE
        )
    `)

    await queryRunner.query(`
      UPDATE "organization_role"
      SET "permissions" = array_append("permissions", 'read:limits')
      WHERE "id" = '${GlobalOrganizationRolesIds.SUPER_ADMIN}'
        AND NOT ('read:limits' = ANY("permissions"))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "organization_role" WHERE "id" = '${GlobalOrganizationRolesIds.LIMITS_VIEWER}'`,
    )

    await queryRunner.query(`UPDATE "api_key" SET "permissions" = array_remove("permissions", 'read:limits')`)
    await queryRunner.query(`UPDATE "organization_role" SET "permissions" = array_remove("permissions", 'read:limits')`)

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

    await queryRunner.query(`ALTER TYPE "public"."api_key_permissions_enum" RENAME TO "api_key_permissions_enum_old"`)
    await queryRunner.query(
      `CREATE TYPE "public"."api_key_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs', 'manage:api_keys', 'manage:secrets')`,
    )
    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "permissions" TYPE "public"."api_key_permissions_enum"[] USING "permissions"::"text"::"public"."api_key_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."api_key_permissions_enum_old"`)
  }
}
