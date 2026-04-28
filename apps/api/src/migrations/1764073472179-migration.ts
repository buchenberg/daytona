/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'
import { configuration } from '../config/configuration'

export class Migration1764073472179 implements MigrationInterface {
  name = 'Migration1764073472179'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create region table
    await queryRunner.query(
      `CREATE TABLE "region" ("id" character varying NOT NULL, "name" character varying NOT NULL, "organizationId" uuid, "hidden" boolean NOT NULL DEFAULT false, "enforceQuotas" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "region_id_pk" PRIMARY KEY ("id"))`,
    )

    // Add unique constraints for region name
    await queryRunner.query(
      `CREATE UNIQUE INDEX "region_organizationId_null_name_unique" ON "region" ("name") WHERE "organizationId" IS NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "region_organizationId_name_unique" ON "region" ("organizationId", "name") WHERE "organizationId" IS NOT NULL`,
    )

    /*
     *
     *
     *
     * START PROD-ONLY SECTION
     *
     *
     *
     */
    // global regions (visible, quotas enforced)
    // for these regions, all existing organizations will get region quotas assigned to them
    await queryRunner.query(
      `INSERT INTO "region" 
        ("id", "name", "organizationId", "hidden", "enforceQuotas") 
        VALUES 
          ('us', 'us', null, false, true),
          ('eu', 'eu', null, false, true)
        `,
    )
    /*
     *
     *
     *
     * END PROD-ONLY SECTION
     *
     *
     *
     */

    // Expand organization table with defaultRegionId column (make it nullable)
    await queryRunner.query(`ALTER TABLE "organization" ADD "defaultRegionId" character varying NULL`)
    await queryRunner.query(`UPDATE "organization" SET "defaultRegionId" = "defaultRegion"`)

    // Add default value for required defaultRegion column before dropping it in the contract migration
    await queryRunner.query(
      `ALTER TABLE "organization" ALTER COLUMN "defaultRegion" SET DEFAULT '${configuration.defaultRegion.id}'`,
    )

    // Create region_quota table
    await queryRunner.query(
      `CREATE TABLE "region_quota" ("organizationId" uuid NOT NULL, "regionId" character varying NOT NULL, "total_cpu_quota" integer NOT NULL DEFAULT '10', "total_memory_quota" integer NOT NULL DEFAULT '10', "total_disk_quota" integer NOT NULL DEFAULT '30', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "region_quota_organizationId_regionId_pk" PRIMARY KEY ("organizationId", "regionId"))`,
    )
    await queryRunner.query(
      `ALTER TABLE "region_quota" ADD CONSTRAINT "region_quota_organizationId_fk" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )

    // For existing organizations, migrate their region-specific quotas to their default region
    await queryRunner.query(`
            INSERT INTO "region_quota" ("organizationId", "regionId", "total_cpu_quota", "total_memory_quota", "total_disk_quota")
            SELECT 
              o."id" as "organizationId",
              o."defaultRegionId" as "regionId",
              o."total_cpu_quota",
              o."total_memory_quota",
              o."total_disk_quota"
            FROM "organization" o
          `)

    /*
     *
     *
     *
     * START PROD-ONLY SECTION
     *
     *
     *
     */
    // Give 10,10,30 limits to existing organizations in shared regions (their default region is already handled)
    await queryRunner.query(`
      INSERT INTO "region_quota" 
        ("organizationId", "regionId", "total_cpu_quota", "total_memory_quota", "total_disk_quota")
      SELECT 
        o."id" as "organizationId",
        r."id" as "regionId",
        10 as "total_cpu_quota",
        10 as "total_memory_quota", 
        30 as "total_disk_quota"
      FROM "organization" o
      CROSS JOIN "region" r
      WHERE r."enforceQuotas" = true 
        AND r."hidden" = false
        AND r."id" != o."defaultRegionId"
    `)

    // dedicated regions (hidden, quotas enforced)
    // not really neccessary to add them since they are only used for spillover, but better to have them in the database just in case
    await queryRunner.query(
      `INSERT INTO "region" 
        ("id", "name", "organizationId", "hidden", "enforceQuotas") 
        VALUES 
          ('writer-dedicated-us', 'writer-dedicated-us', null, true, true),
          ('writer-dedicated-eu', 'writer-dedicated-eu', null, true, true),
          ('large-sandbox-shared', 'large-sandbox-shared', null, true, true)
        `,
    )

    // custom shared regions (hidden, quotas enforced)
    await queryRunner.query(
      `INSERT INTO "region" 
            ("id", "name", "organizationId", "hidden", "enforceQuotas") 
            VALUES 
              ('custom-region-test', 'custom-region-test', null, true, true)
            `,
    )

    // custom organization regions (visible, quotas enforced)
    // Only insert rows whose target organization actually exists so this is a no-op on a fresh DB.
    await queryRunner.query(`
      INSERT INTO "region" ("id", "name", "organizationId", "hidden", "enforceQuotas")
      SELECT v."id", v."name", v."organizationId"::uuid, v."hidden", v."enforceQuotas"
      FROM (VALUES
        ('codeany', 'codeany', '26a8fb68-6fb1-4429-b766-5df6795a5ab0', false, true),
        ('codeany-free', 'codeany-free', '26a8fb68-6fb1-4429-b766-5df6795a5ab0', false, true),
        ('browser-use', 'browser-use', '9187b39a-b22a-4207-be3b-c67b42ae10d0', false, true),
        ('us-ext-sandbox', 'us-ext-sandbox', 'ebe1abc6-dc31-4b49-8f4f-953b096ecf40', false, true),
        ('us-ext-577151', 'us-ext-577151', '0fcf06b6-2dc2-4899-8c59-41460e2760ce', false, true),
        ('us-ext-777185', 'us-ext-777185', 'f48ca04b-3a47-4c81-b626-da44bb888bb1', false, true),
        ('us-ext-840021', 'us-ext-840021', 'e7395d35-9f0c-40be-8fdb-84165ae48e82', false, true),
        ('kepler-dedicated-regular', 'kepler-dedicated-regular', '83e127af-2de9-4549-903c-b7bf907ecb58', false, true),
        ('kepler-dedicated-large', 'kepler-dedicated-large', '83e127af-2de9-4549-903c-b7bf907ecb58', false, true)
      ) AS v("id", "name", "organizationId", "hidden", "enforceQuotas")
      WHERE EXISTS (SELECT 1 FROM "organization" WHERE "id" = v."organizationId"::uuid)
    `)

    // Codeanywhere org has "us" as default region, decrease their quotas
    await queryRunner.query(`
      UPDATE "region_quota"
      SET "total_cpu_quota" = 2000, "total_memory_quota" = 4000, "total_disk_quota" = 8000
      WHERE "organizationId" = '26a8fb68-6fb1-4429-b766-5df6795a5ab0' AND "regionId" = 'us'
    `)

    // Handle orgs that need a bit more resources in shared regions outside of their default region
    /**
     * tier 2 limits in "eu" for niralliaandani.work@gmail.com personal org
     */
    await queryRunner.query(`
      UPDATE "region_quota"
      SET "total_cpu_quota" = 100, "total_memory_quota" = 200, "total_disk_quota" = 300
      WHERE "organizationId" = 'baeee019-117d-49b8-ba09-78498c3b5711' AND "regionId" = 'eu'
    `)
    /**
     * tier 2 limits in "eu" for Softgen AI
     */
    await queryRunner.query(`
      UPDATE "region_quota"
      SET "total_cpu_quota" = 100, "total_memory_quota" = 200, "total_disk_quota" = 300
      WHERE "organizationId" = 'd1484e97-5707-4705-90e4-d397544ca009' AND "regionId" = 'eu'
    `)
    /**
     * tier 2 limits in "eu" for idagelic@daytona.io personal org
     */
    await queryRunner.query(`
      UPDATE "region_quota"
      SET "total_cpu_quota" = 100, "total_memory_quota" = 200, "total_disk_quota" = 300
      WHERE "organizationId" = '19336c5f-4f0c-4431-89b0-f42311305913' AND "regionId" = 'eu'
    `)
    /**
     * tier 2 limits in "eu" for platformaigpt@gmail.com personal org
     */
    await queryRunner.query(`
      UPDATE "region_quota"
      SET "total_cpu_quota" = 100, "total_memory_quota" = 200, "total_disk_quota" = 300
      WHERE "organizationId" = '27cd4b27-413c-4a28-bdad-e0df9ef770d7' AND "regionId" = 'eu'
    `)
    /**
     * tier 2 limits in "eu" for BuildingPP OÜ
     */
    await queryRunner.query(`
      UPDATE "region_quota"
      SET "total_cpu_quota" = 100, "total_memory_quota" = 200, "total_disk_quota" = 300
      WHERE "organizationId" = '51a748b7-e8cb-4811-b38c-5a299671978a' AND "regionId" = 'eu'
    `)

    // Add necessary region quotas for custom regions
    /*
     * codeany - half of current codeanywhere quotas
     * codeany-free - half of current codeanywhere-free quotas
     * browser-use - tier 3 quotas, but we don't have runners in this region at the moment
     * us-ext-sandbox - same as their default "us" region quotas
     * us-ext-577151 - same as their default "us" region quotas
     * us-ext-777185 - same as their default "us" region quotas
     * us-ext-840021 - same as their default "us" region quotas
     * custom-region-test - tier 3 limits to daytona members
     */
    // Only insert quotas whose target organization and region actually exist so this is a no-op on a fresh DB.
    await queryRunner.query(`
      INSERT INTO "region_quota" ("organizationId", "regionId", "total_cpu_quota", "total_memory_quota", "total_disk_quota")
      SELECT v."organizationId"::uuid, v."regionId", v."total_cpu_quota", v."total_memory_quota", v."total_disk_quota"
      FROM (VALUES
        ('26a8fb68-6fb1-4429-b766-5df6795a5ab0', 'codeany', 2500, 5000, 50000),
        ('26a8fb68-6fb1-4429-b766-5df6795a5ab0', 'codeany-free', 2500, 5000, 50000),
        ('9187b39a-b22a-4207-be3b-c67b42ae10d0', 'browser-use', 250, 500, 2000),
        ('ebe1abc6-dc31-4b49-8f4f-953b096ecf40', 'us-ext-sandbox', 100, 350, 3000),
        ('0fcf06b6-2dc2-4899-8c59-41460e2760ce', 'us-ext-577151', 100, 350, 3000),
        ('f48ca04b-3a47-4c81-b626-da44bb888bb1', 'us-ext-777185', 100, 350, 3000),
        ('e7395d35-9f0c-40be-8fdb-84165ae48e82', 'us-ext-840021', 100, 350, 3000),
        ('3ae0ced2-f32b-4c06-ba3b-51e5bb22e6e6', 'custom-region-test', 250, 500, 2000),
        ('bf29e0f2-5fa9-48db-b80c-c7fae9c4e29c', 'custom-region-test', 250, 500, 2000),
        ('1db02bc5-acae-447b-b6ad-f5fa323d3cf6', 'custom-region-test', 250, 500, 2000),
        ('99c32bbf-0ba0-4980-af71-22f50376032e', 'custom-region-test', 250, 500, 2000)
      ) AS v("organizationId", "regionId", "total_cpu_quota", "total_memory_quota", "total_disk_quota")
      WHERE EXISTS (SELECT 1 FROM "organization" WHERE "id" = v."organizationId"::uuid)
        AND EXISTS (SELECT 1 FROM "region" WHERE "id" = v."regionId")
    `)
    /*
     *
     *
     *
     * END PROD-ONLY SECTION
     *
     *
     *
     */
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop region table
    await queryRunner.query(`DROP TABLE "region"`)

    // Drop defaultRegionId column from organization table
    await queryRunner.dropColumn('organization', 'defaultRegionId')

    // Drop region_quota table
    await queryRunner.query(`DROP TABLE "region_quota"`)
  }
}
