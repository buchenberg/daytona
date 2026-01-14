/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'
import { GlobalOrganizationRolesIds } from '../organization/constants/global-organization-roles.constant'
import { OrganizationResourcePermission } from '../organization/enums/organization-resource-permission.enum'

/**
 * _Expand_ migration for runner V2 refactor
 */
export class Migration1768393015161 implements MigrationInterface {
  name = 'Migration1768393015161'

  public async up(queryRunner: QueryRunner): Promise<void> {
    /**
     * ------------------------------------------------------------------------
     * Section 1: new region."regionType" field (custom type + check constraints)
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`CREATE TYPE "public"."region_regiontype_enum" AS ENUM('shared', 'dedicated', 'custom')`)
    await queryRunner.query(`ALTER TABLE "region" ADD "regionType" "public"."region_regiontype_enum"`)
    await queryRunner.query(
      `ALTER TABLE "region" ADD CONSTRAINT "region_not_custom" CHECK ("organizationId" IS NOT NULL OR "regionType" != 'custom')`,
    )
    await queryRunner.query(
      `ALTER TABLE "region" ADD CONSTRAINT "region_not_shared" CHECK ("organizationId" IS NULL OR "regionType" != 'shared')`,
    )
    await queryRunner.query(`UPDATE "region" SET "regionType" = 'custom' WHERE "organizationId" IS NOT NULL`)
    await queryRunner.query(`UPDATE "region" SET "regionType" = 'shared' WHERE "organizationId" IS NULL`)
    await queryRunner.query(`
      UPDATE "region" SET "regionType" = 'dedicated'
      WHERE "id" IN (
        'writer-dedicated-us',
        'writer-dedicated-eu',
        'large-sandbox-shared',
        'custom-region-test'
      )
    `)
    await queryRunner.query(`ALTER TABLE "region" ALTER COLUMN "regionType" SET NOT NULL`)

    /**
     * ------------------------------------------------------------------------
     * Section 2: expand RBAC for regions and runners (api key permissions, org role permissions, infra admin global role)
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TYPE "public"."api_key_permissions_enum" RENAME TO "api_key_permissions_enum_old"`)
    await queryRunner.query(
      `CREATE TYPE "public"."api_key_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs')`,
    )
    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "permissions" TYPE "public"."api_key_permissions_enum"[] USING "permissions"::"text"::"public"."api_key_permissions_enum"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."api_key_permissions_enum_old"`)

    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum" RENAME TO "organization_role_permissions_enum_old"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."organization_role_permissions_enum" AS ENUM('write:registries', 'delete:registries', 'write:snapshots', 'delete:snapshots', 'write:sandboxes', 'delete:sandboxes', 'read:volumes', 'write:volumes', 'delete:volumes', 'write:regions', 'delete:regions', 'read:runners', 'write:runners', 'delete:runners', 'read:audit_logs')`,
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
            '${GlobalOrganizationRolesIds.INFRASTRUCTURE_ADMIN}',    
            'Infrastructure Admin', 
            'Grants admin access to infrastructure in the organization', 
            ARRAY[
            '${OrganizationResourcePermission.WRITE_REGIONS}',
            '${OrganizationResourcePermission.DELETE_REGIONS}',
            '${OrganizationResourcePermission.READ_RUNNERS}',
            '${OrganizationResourcePermission.WRITE_RUNNERS}',
            '${OrganizationResourcePermission.DELETE_RUNNERS}'
            ]::organization_role_permissions_enum[],
            TRUE
        )
    `)

    /**
     * ------------------------------------------------------------------------
     * Section 3: new runner.name field
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ADD "name" character varying`)
    await queryRunner.query(`UPDATE "runner" SET "name" = "id"`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "name" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ADD CONSTRAINT "runner_region_name_unique" UNIQUE ("region", "name")`)

    /**
     * ------------------------------------------------------------------------
     * Section 4: new runner index
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(
      `CREATE INDEX "runner_state_unschedulable_region_index" ON "runner" ("state", "unschedulable", "region") `,
    )

    /**
     * ------------------------------------------------------------------------
     * Section 5: new region fields (proxy, ssh gateway)
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "region" ADD "proxyUrl" character varying`)
    await queryRunner.query(`ALTER TABLE "region" ADD "toolboxProxyUrl" character varying`)
    await queryRunner.query(`ALTER TABLE "region" ADD "proxyApiKeyHash" character varying`)
    await queryRunner.query(`ALTER TABLE "region" ADD "sshGatewayUrl" character varying`)
    await queryRunner.query(`ALTER TABLE "region" ADD "sshGatewayApiKeyHash" character varying`)
    await queryRunner.query(`ALTER TABLE "region" ADD "snapshotManagerUrl" character varying`)

    /**
     * ------------------------------------------------------------------------
     * Section 6: new snapshot_region table (+ add entries for existing snapshots)
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`
        CREATE TABLE "snapshot_region" (
            "snapshotId" uuid NOT NULL,
            "regionId" character varying NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_snapshot_region" PRIMARY KEY ("snapshotId", "regionId")
        )
    `)

    await queryRunner.query(`
        ALTER TABLE "snapshot_region"
        ADD CONSTRAINT "FK_snapshot_region_snapshot"
        FOREIGN KEY ("snapshotId") REFERENCES "snapshot"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)

    await queryRunner.query(`
        ALTER TABLE "snapshot_region"
        ADD CONSTRAINT "FK_snapshot_region_region"
        FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)

    // all snapshots to us
    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'us' FROM "snapshot"
    `)

    // all snapshots to eu
    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'eu' FROM "snapshot"
    `)

    // custom regions
    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'codeany' FROM "snapshot" WHERE "organizationId" = '26a8fb68-6fb1-4429-b766-5df6795a5ab0'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'codeany-free' FROM "snapshot" WHERE "organizationId" = '26a8fb68-6fb1-4429-b766-5df6795a5ab0'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'browser-use' FROM "snapshot" WHERE "organizationId" = '9187b39a-b22a-4207-be3b-c67b42ae10d0'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'us-ext-sandbox' FROM "snapshot" WHERE "organizationId" = 'ebe1abc6-dc31-4b49-8f4f-953b096ecf40'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'us-ext-577151' FROM "snapshot" WHERE "organizationId" = '0fcf06b6-2dc2-4899-8c59-41460e2760ce'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'us-ext-777185' FROM "snapshot" WHERE "organizationId" = 'f48ca04b-3a47-4c81-b626-da44bb888bb1'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'us-ext-840021' FROM "snapshot" WHERE "organizationId" = 'e7395d35-9f0c-40be-8fdb-84165ae48e82'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'kepler-dedicated-regular' FROM "snapshot" WHERE "organizationId" = '83e127af-2de9-4549-903c-b7bf907ecb58'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'kepler-dedicated-large' FROM "snapshot" WHERE "organizationId" = '83e127af-2de9-4549-903c-b7bf907ecb58'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'asia-magic' FROM "snapshot" WHERE "organizationId" = '759d646f-5427-4aee-b4e3-3290fa920fce'
    `)

    await queryRunner.query(`
        INSERT INTO "snapshot_region" ("snapshotId", "regionId")
        SELECT "id", 'elementor-dedicated' FROM "snapshot" WHERE "organizationId" = '530f9030-4de4-4ed9-9097-3c3095524c22'
    `)

    /**
     * ------------------------------------------------------------------------
     * Section 7: new docker_registry indexes
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(
      `CREATE INDEX "docker_registry_registryType_isDefault_index" ON "docker_registry" ("registryType", "isDefault") `,
    )
    await queryRunner.query(
      `CREATE INDEX "docker_registry_region_registryType_index" ON "docker_registry" ("region", "registryType") `,
    )
    await queryRunner.query(
      `CREATE INDEX "docker_registry_organizationId_registryType_index" ON "docker_registry" ("organizationId", "registryType") `,
    )

    /**
     * ------------------------------------------------------------------------
     * Section 8: new job table (+ custom types, indexes, etc.)
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(
      `CREATE TYPE "public"."job_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')`,
    )
    await queryRunner.query(`CREATE TYPE "public"."job_resourcetype_enum" AS ENUM('SANDBOX', 'SNAPSHOT', 'BACKUP')`)
    await queryRunner.query(
      `CREATE TABLE "job" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "version" integer NOT NULL, "type" character varying NOT NULL, "status" "public"."job_status_enum" NOT NULL DEFAULT 'PENDING', "runnerId" character varying NOT NULL, "resourceType" "public"."job_resourcetype_enum" NOT NULL, "resourceId" character varying NOT NULL, "payload" character varying, "resultMetadata" character varying, "traceContext" jsonb, "errorMessage" text, "startedAt" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "job_id_pk" PRIMARY KEY ("id"))`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_UNIQUE_INCOMPLETE_JOB" ON "job" ("resourceType", "resourceId", "runnerId") WHERE "completedAt" IS NULL`,
    )
    await queryRunner.query(`CREATE INDEX "job_resourceType_resourceId_index" ON "job" ("resourceType", "resourceId") `)
    await queryRunner.query(`CREATE INDEX "job_status_createdAt_index" ON "job" ("status", "createdAt") `)
    await queryRunner.query(`CREATE INDEX "job_runnerId_status_index" ON "job" ("runnerId", "status") `)

    /**
     * ------------------------------------------------------------------------
     * Section 9: new runner version fields (apiVersion, appVersion)
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ADD "apiVersion" character varying DEFAULT '0'`)
    await queryRunner.query(`UPDATE "runner" SET "apiVersion" = "version"`)

    await queryRunner.query(`ALTER TABLE "runner" ADD "appVersion" character varying DEFAULT 'v0.0.0-dev'`)

    /**
     * ------------------------------------------------------------------------
     * Section 10: drop constraints for runner fields
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "domain" DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" DROP CONSTRAINT "UQ_330d74ac3d0e349b4c73c62ad6d"`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "apiUrl" DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "proxyUrl" DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "gpu" DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "gpuType" DROP NOT NULL`)

    /**
     * ------------------------------------------------------------------------
     * Section 11: drop defaults for runner fields
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "proxyUrl" DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "region" DROP DEFAULT`)

    /**
     * ------------------------------------------------------------------------
     * Section 12: alter types for runner fields
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "cpu" TYPE double precision`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "memoryGiB" TYPE double precision`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "diskGiB" TYPE double precision`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /**
     * ------------------------------------------------------------------------
     * Revert Section 1
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "regionType"`)
    await queryRunner.query(`DROP TYPE "public"."region_regiontype_enum"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 2
     * ------------------------------------------------------------------------
     */

    await queryRunner.query(
      `DELETE FROM "organization_role" WHERE "id" = '${GlobalOrganizationRolesIds.INFRASTRUCTURE_ADMIN}'`,
    )

    await queryRunner.query(
      `CREATE TYPE "public"."api_key_permissions_enum_old" AS ENUM('delete:registries', 'delete:sandboxes', 'delete:snapshots', 'delete:volumes', 'read:audit_logs', 'read:volumes', 'write:registries', 'write:sandboxes', 'write:snapshots', 'write:volumes')`,
    )
    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "permissions" TYPE "public"."api_key_permissions_enum_old"[] USING "permissions"::"text"::"public"."api_key_permissions_enum_old"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."api_key_permissions_enum"`)
    await queryRunner.query(`ALTER TYPE "public"."api_key_permissions_enum_old" RENAME TO "api_key_permissions_enum"`)

    await queryRunner.query(
      `CREATE TYPE "public"."organization_role_permissions_enum_old" AS ENUM('delete:registries', 'delete:sandboxes', 'delete:snapshots', 'delete:volumes', 'read:audit_logs', 'read:volumes', 'write:registries', 'write:sandboxes', 'write:snapshots', 'write:volumes')`,
    )
    await queryRunner.query(
      `ALTER TABLE "organization_role" ALTER COLUMN "permissions" TYPE "public"."organization_role_permissions_enum_old"[] USING "permissions"::"text"::"public"."organization_role_permissions_enum_old"[]`,
    )
    await queryRunner.query(`DROP TYPE "public"."organization_role_permissions_enum"`)
    await queryRunner.query(
      `ALTER TYPE "public"."organization_role_permissions_enum_old" RENAME TO "organization_role_permissions_enum"`,
    )
    /**
     * ------------------------------------------------------------------------
     * Revert Section 3
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" DROP COLUMN "name"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 4
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`DROP INDEX "public"."runner_state_unschedulable_region_index"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 5
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "sshGatewayApiKeyHash"`)
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "sshGatewayUrl"`)
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "proxyApiKeyHash"`)
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "toolboxProxyUrl"`)
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "proxyUrl"`)
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "snapshotManagerUrl"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 6
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`DROP TABLE "snapshot_region"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 7
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`DROP INDEX "public"."docker_registry_organizationId_registryType_index"`)
    await queryRunner.query(`DROP INDEX "public"."docker_registry_region_registryType_index"`)
    await queryRunner.query(`DROP INDEX "public"."docker_registry_registryType_isDefault_index"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 8
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`DROP TABLE "job"`)
    await queryRunner.query(`DROP TYPE "public"."job_resourcetype_enum"`)
    await queryRunner.query(`DROP TYPE "public"."job_status_enum"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 9
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" DROP COLUMN "apiVersion"`)
    await queryRunner.query(`ALTER TABLE "runner" DROP COLUMN "appVersion"`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 10
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "domain" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ADD CONSTRAINT "UQ_330d74ac3d0e349b4c73c62ad6d" UNIQUE ("domain")`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "apiUrl" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "proxyUrl" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "gpu" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "gpuType" SET NOT NULL`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 11
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "proxyUrl" SET DEFAULT ''`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "region" SET DEFAULT 'us'`)

    /**
     * ------------------------------------------------------------------------
     * Revert Section 12
     * ------------------------------------------------------------------------
     */
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "cpu" TYPE integer`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "memoryGiB" TYPE integer`)
    await queryRunner.query(`ALTER TABLE "runner" ALTER COLUMN "diskGiB" TYPE integer`)
  }
}
