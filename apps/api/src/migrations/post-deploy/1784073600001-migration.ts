import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Contract phase of renaming region_quota's "max_*_per_gpu_sandbox" columns
 * to "max_*_per_gpu" (see pre-deploy migration 1784073600000): once no old
 * API instances remain, drop the sync trigger and the old columns.
 */
export class Migration1784073600001 implements MigrationInterface {
  name = 'Migration1784073600001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS region_quota_per_gpu_limits_sync ON "region_quota"`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS sync_region_quota_per_gpu_limits()`)
    await queryRunner.query(`ALTER TABLE "region_quota" DROP COLUMN "max_disk_per_gpu_sandbox"`)
    await queryRunner.query(`ALTER TABLE "region_quota" DROP COLUMN "max_memory_per_gpu_sandbox"`)
    await queryRunner.query(`ALTER TABLE "region_quota" DROP COLUMN "max_cpu_per_gpu_sandbox"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "region_quota" ADD "max_cpu_per_gpu_sandbox" integer DEFAULT 16`)
    await queryRunner.query(`ALTER TABLE "region_quota" ADD "max_memory_per_gpu_sandbox" integer DEFAULT 192`)
    await queryRunner.query(`ALTER TABLE "region_quota" ADD "max_disk_per_gpu_sandbox" integer DEFAULT 512`)
    await queryRunner.query(`
      UPDATE "region_quota"
      SET "max_cpu_per_gpu_sandbox" = "max_cpu_per_gpu",
          "max_memory_per_gpu_sandbox" = "max_memory_per_gpu",
          "max_disk_per_gpu_sandbox" = "max_disk_per_gpu"
    `)

    // Restore the sync trigger (same definition as pre-deploy migration
    // 1784073600000): a rollback means old-API instances come back and write
    // the old columns, and without the trigger those writes would diverge
    // from the new columns and be dropped by a later re-apply of up().
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION sync_region_quota_per_gpu_limits()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          IF NEW."max_cpu_per_gpu" IS DISTINCT FROM OLD."max_cpu_per_gpu" THEN
            NEW."max_cpu_per_gpu_sandbox" := NEW."max_cpu_per_gpu";
          ELSIF NEW."max_cpu_per_gpu_sandbox" IS DISTINCT FROM OLD."max_cpu_per_gpu_sandbox" THEN
            NEW."max_cpu_per_gpu" := NEW."max_cpu_per_gpu_sandbox";
          END IF;
          IF NEW."max_memory_per_gpu" IS DISTINCT FROM OLD."max_memory_per_gpu" THEN
            NEW."max_memory_per_gpu_sandbox" := NEW."max_memory_per_gpu";
          ELSIF NEW."max_memory_per_gpu_sandbox" IS DISTINCT FROM OLD."max_memory_per_gpu_sandbox" THEN
            NEW."max_memory_per_gpu" := NEW."max_memory_per_gpu_sandbox";
          END IF;
          IF NEW."max_disk_per_gpu" IS DISTINCT FROM OLD."max_disk_per_gpu" THEN
            NEW."max_disk_per_gpu_sandbox" := NEW."max_disk_per_gpu";
          ELSIF NEW."max_disk_per_gpu_sandbox" IS DISTINCT FROM OLD."max_disk_per_gpu_sandbox" THEN
            NEW."max_disk_per_gpu" := NEW."max_disk_per_gpu_sandbox";
          END IF;
        ELSE
          IF NEW."max_cpu_per_gpu" IS DISTINCT FROM 16 THEN
            NEW."max_cpu_per_gpu_sandbox" := NEW."max_cpu_per_gpu";
          ELSIF NEW."max_cpu_per_gpu_sandbox" IS DISTINCT FROM 16 THEN
            NEW."max_cpu_per_gpu" := NEW."max_cpu_per_gpu_sandbox";
          END IF;
          IF NEW."max_memory_per_gpu" IS DISTINCT FROM 192 THEN
            NEW."max_memory_per_gpu_sandbox" := NEW."max_memory_per_gpu";
          ELSIF NEW."max_memory_per_gpu_sandbox" IS DISTINCT FROM 192 THEN
            NEW."max_memory_per_gpu" := NEW."max_memory_per_gpu_sandbox";
          END IF;
          IF NEW."max_disk_per_gpu" IS DISTINCT FROM 512 THEN
            NEW."max_disk_per_gpu_sandbox" := NEW."max_disk_per_gpu";
          ELSIF NEW."max_disk_per_gpu_sandbox" IS DISTINCT FROM 512 THEN
            NEW."max_disk_per_gpu" := NEW."max_disk_per_gpu_sandbox";
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    await queryRunner.query(`
      CREATE TRIGGER region_quota_per_gpu_limits_sync
      BEFORE INSERT OR UPDATE ON "region_quota"
      FOR EACH ROW EXECUTE FUNCTION sync_region_quota_per_gpu_limits();
    `)
  }
}
