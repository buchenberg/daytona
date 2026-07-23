import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Contract phase (post-deploy) of moving region spillover logic into the database
 * (see pre-deploy migration 1784000000000).
 *
 * Renames the legacy dedicated regions `meta-dedicated` -> `RL01` and
 * `deeptune-dedicated` -> `RL02` in the three places a dedicated region id is actually stored:
 * `region.id`, `region_quota.effective_region_id` (seeded by the pre-deploy migration), and
 * `runner.region`. See `renameRegion` for why the other region-id columns are intentionally
 * left untouched.
 *
 * This is deliberately deferred to post-deploy: the region id is used as a runner-selection key
 * (runners/sandboxes are tagged with it) and the *old* API hardcodes `meta-dedicated` /
 * `deeptune-dedicated`. Renaming while old API instances are still running (i.e. in pre-deploy or
 * mid-rollout) would leave them unable to find any runners for those orgs. By the time this runs,
 * only the new DB-driven API remains, and it picks up the renamed ids on its next routing-cache
 * refresh.
 *
 * All UPDATEs are no-ops when no row uses the source id, so this is safe on a fresh database.
 */
export class Migration1784000000001 implements MigrationInterface {
  name = 'Migration1784000000001'

  // [fromId, toId] pairs. Order does not matter; each is renamed independently.
  private static readonly REGION_RENAMES: Array<[string, string]> = [
    ['meta-dedicated', 'RL01'],
    ['deeptune-dedicated', 'RL02'],
  ]

  /**
   * Renames a region id in the only three places a dedicated region id is actually stored:
   *  - `region.id` (the PK / region row itself)
   *  - `region_quota.effective_region_id` (org routing seeded by the pre-deploy migration)
   *  - `runner.region` (runners physically registered in the region)
   *
   * Other columns that can hold a region id — `sandbox.region`, `snapshot_region.regionId`,
   * `docker_registry.region`, `region.fallback_region_id`, `region_quota.regionId` — only ever
   * contain *base/public* region ids (`us`, `eu`, …), never the internal dedicated ids being
   * renamed here, so updating them would be a no-op. See the `COUNT(*)` checks in the PR notes.
   *
   * Because `snapshot_region` (the only table with an FK to `region.id`, `ON UPDATE NO ACTION`)
   * holds no rows referencing these dedicated regions, the FK does not block the PK update, so
   * there is no need to drop/recreate it (which would also have taken an ACCESS EXCLUSIVE lock).
   *
   * All UPDATEs are no-ops when no row uses `fromId`, so this is safe on a fresh database.
   */
  private async renameRegion(queryRunner: QueryRunner, fromId: string, toId: string): Promise<void> {
    // The region row itself (PK).
    await queryRunner.query(`UPDATE "region" SET "id" = $1 WHERE "id" = $2`, [toId, fromId])
    // Org routing rows routed to this region.
    await queryRunner.query(`UPDATE "region_quota" SET "effective_region_id" = $1 WHERE "effective_region_id" = $2`, [
      toId,
      fromId,
    ])
    // Runners physically registered in the region.
    await queryRunner.query(`UPDATE "runner" SET "region" = $1 WHERE "region" = $2`, [toId, fromId])
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [fromId, toId] of Migration1784000000001.REGION_RENAMES) {
      await this.renameRegion(queryRunner, fromId, toId)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [fromId, toId] of Migration1784000000001.REGION_RENAMES) {
      await this.renameRegion(queryRunner, toId, fromId)
    }
  }
}
