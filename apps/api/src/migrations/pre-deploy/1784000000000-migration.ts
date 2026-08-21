import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Expand phase (pre-deploy) of moving the hardcoded region spillover logic out of the codebase
 * and into the database:
 *  - region_quota.effective_region_id: the dedicated region an org's sandboxes are placed on for a
 *    base region (e.g. us -> meta-dedicated)
 *  - region.fallback_region_id: the spillover target for a (dedicated) region (e.g. meta-dedicated -> us)
 *  - region.spillover_on_error: whether sandboxes on this region may retry on the fallback region on
 *    runner errors (defaults to true; requires fallback_region_id to take effect)
 *
 * This migration is intentionally backward-compatible with the currently deployed API: it only adds
 * columns and seeds routing/fallback data that the old API ignores. It deliberately does NOT rename
 * the legacy dedicated regions.
 *
 * The rename of the legacy dedicated regions `meta-dedicated` -> `RL01` and
 * `deeptune-dedicated` -> `RL02` is a *breaking* change: those IDs are hardcoded in the
 * currently running API and used as runner-selection keys (runners/sandboxes are tagged with the
 * region id). Renaming them here, before the new API rolls out, would leave old API instances
 * unable to find any runners for those orgs during the rolling deployment window. The rename is
 * therefore deferred to the contract phase in post-deploy migration 1784000000001, which runs once
 * only new (DB-driven) API instances remain.
 *
 * All UPDATEs are no-ops on a fresh database (no matching rows) and the region INSERTs use
 * ON CONFLICT DO NOTHING, so this is safe to run on a fresh database.
 */
export class Migration1784000000000 implements MigrationInterface {
  name = 'Migration1784000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Schema changes
    await queryRunner.query(`ALTER TABLE "region_quota" ADD "effective_region_id" character varying`)
    await queryRunner.query(`ALTER TABLE "region" ADD "fallback_region_id" character varying`)
    await queryRunner.query(`ALTER TABLE "region" ADD "spillover_on_error" boolean NOT NULL DEFAULT true`)

    /*
     *
     *
     *
     * START PROD-ONLY SECTION
     *
     * The statements below seed the current hardcoded routing/fallback/spillover values. They
     * reference specific production organization and region IDs and are keyed on the CURRENT
     * (legacy) region ids (`meta-dedicated`, `deeptune-dedicated`) so both the currently deployed
     * API (which hardcodes those ids) and the new DB-driven API resolve to the same runners during
     * the rolling deployment. Post-deploy migration 1784000000001 renames these regions to their
     * new RL01/RL02 names (rewriting these seeded columns in the process).
     *
     * UPDATEs are no-ops on a fresh database (no matching rows) and the region INSERTs use
     * ON CONFLICT DO NOTHING.
     *
     *
     *
     */

    // Ensure the dedicated region rows exist so fallback mappings can be attached to them.
    // writer-dedicated-us/eu and large-sandbox-shared were seeded in an earlier migration.
    // meta-dedicated/deeptune-dedicated already exist in production; on a fresh database they are
    // created here under their legacy names and renamed by the post-deploy migration.
    await queryRunner.query(`
      INSERT INTO "region" ("id", "name", "organizationId", "regionType", "enforceQuotas")
      VALUES
        ('meta-dedicated', 'meta-dedicated', null, 'dedicated', true),
        ('deeptune-dedicated', 'deeptune-dedicated', null, 'dedicated', true),
        ('elementor-dedicated', 'elementor-dedicated', null, 'dedicated', true)
      ON CONFLICT ("id") DO NOTHING
    `)

    // Capacity fallback targets for dedicated regions: when a region has no available runners,
    // sandbox assignment retries on the fallback region. This applies to all four dedicated
    // regions below and mirrors the pre-migration `getFallbackRegion` behavior.
    await queryRunner.query(`UPDATE "region" SET "fallback_region_id" = 'us' WHERE "id" = 'writer-dedicated-us'`)
    await queryRunner.query(`UPDATE "region" SET "fallback_region_id" = 'eu' WHERE "id" = 'writer-dedicated-eu'`)
    await queryRunner.query(`UPDATE "region" SET "fallback_region_id" = 'us' WHERE "id" = 'meta-dedicated'`)
    await queryRunner.query(`UPDATE "region" SET "fallback_region_id" = 'us' WHERE "id" = 'deeptune-dedicated'`)

    // Error-driven spillover (retry on the fallback region when a runner returns a
    // spillover-eligible error) must be limited to the Meta/Deeptune dedicated regions
    // (renamed to RL01/RL02 in post-deploy), matching the pre-migration behavior where only
    // Meta/Deeptune orgs were in the error-spillover set. `spillover_on_error` defaults to true,
    // so disable it explicitly on the Writer dedicated regions: they keep the capacity fallback
    // above but must NOT auto-spill on runner errors.
    await queryRunner.query(
      `UPDATE "region" SET "spillover_on_error" = false WHERE "id" IN ('writer-dedicated-us', 'writer-dedicated-eu')`,
    )

    // Org routing: base region -> dedicated region (WRITER orgs).
    await queryRunner.query(`
      UPDATE "region_quota" SET "effective_region_id" = 'writer-dedicated-us'
      WHERE "regionId" = 'us' AND "organizationId" IN (
        'ebe1abc6-dc31-4b49-8f4f-953b096ecf40',
        '0fcf06b6-2dc2-4899-8c59-41460e2760ce',
        'f48ca04b-3a47-4c81-b626-da44bb888bb1',
        'e7395d35-9f0c-40be-8fdb-84165ae48e82',
        'b85fe86a-db98-46d8-850b-77166ee6d97b',
        'f74e75e9-47ad-4d5d-bc10-f0f5994f7117',
        'a6d3672e-4fab-4117-bcbb-913dba768d75',
        '2ca4611c-c53f-4669-88ce-376a1d4ffe2a',
        '815f0cf1-037d-4514-a7ec-2251b0b33596',
        '6780b872-df13-44b6-bc6a-59c56ca469c3',
        'd3df4094-226d-400b-804a-e4f9aa5a60d0',
        '13dd8c35-0468-444a-a248-398e0d2d02d2'
      )
    `)
    await queryRunner.query(`
      UPDATE "region_quota" SET "effective_region_id" = 'writer-dedicated-eu'
      WHERE "regionId" = 'eu' AND "organizationId" IN (
        'ebe1abc6-dc31-4b49-8f4f-953b096ecf40',
        '0fcf06b6-2dc2-4899-8c59-41460e2760ce',
        'f48ca04b-3a47-4c81-b626-da44bb888bb1',
        'e7395d35-9f0c-40be-8fdb-84165ae48e82',
        'b85fe86a-db98-46d8-850b-77166ee6d97b',
        'f74e75e9-47ad-4d5d-bc10-f0f5994f7117',
        'a6d3672e-4fab-4117-bcbb-913dba768d75',
        '2ca4611c-c53f-4669-88ce-376a1d4ffe2a',
        '815f0cf1-037d-4514-a7ec-2251b0b33596',
        '6780b872-df13-44b6-bc6a-59c56ca469c3',
        'd3df4094-226d-400b-804a-e4f9aa5a60d0',
        '13dd8c35-0468-444a-a248-398e0d2d02d2'
      )
    `)

    // Org routing: Meta us -> meta-dedicated (renamed to RL01 in post-deploy).
    await queryRunner.query(`
      UPDATE "region_quota" SET "effective_region_id" = 'meta-dedicated'
      WHERE "regionId" = 'us' AND "organizationId" IN (
        'fd4f4489-5a9b-4d7b-b62e-dbd26113115c',
        '683acf39-5b83-49eb-9c43-f8056cec924a',
        'bfd70412-3a0f-4973-bd7c-f8234d933dfd',
        '37424cf2-c171-45a7-9628-e0ccc0f17750',
        '1fa758b9-6ef2-4ef0-9d2c-6477d4666f07',
        'cbd6042b-5425-4bce-8fad-e5673fded021',
        'bac16d29-0ad6-49ab-93fa-bb0d9131be56'
      )
    `)

    // Org routing: Deeptune + Million us -> deeptune-dedicated (renamed to RL02 in post-deploy).
    await queryRunner.query(`
      UPDATE "region_quota" SET "effective_region_id" = 'deeptune-dedicated'
      WHERE "regionId" = 'us' AND "organizationId" IN (
        'c0a5d258-844b-44da-aac0-706f31c3027f',
        'c8789392-ea10-4be4-9b24-71c23a6c30da',
        'c543c338-b39a-4abf-a07a-095c0b23a380'
      )
    `)

    // Org routing: LG orgs -> elementor-dedicated (independent of base region).
    await queryRunner.query(`
      UPDATE "region_quota" SET "effective_region_id" = 'elementor-dedicated'
      WHERE "organizationId" IN (
        'ffd8d89a-126a-4154-ad8f-16c54c18522a',
        'bb738f7e-d7eb-47c1-847c-3154a308f1e5',
        '7270a8f6-9e34-46a2-9254-466627e06bac'
      )
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
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "spillover_on_error"`)
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "fallback_region_id"`)
    await queryRunner.query(`ALTER TABLE "region_quota" DROP COLUMN "effective_region_id"`)
  }
}
