import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Replace the free-form due_date/slack_url fields on maintenance requests
 * with a p0-p3 priority (0 = most urgent, default p2).
 */
export class MaintenanceRequestPriority1784118153202 implements MigrationInterface {
  name = 'MaintenanceRequestPriority1784118153202'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE maintenance_request
        DROP COLUMN due_date,
        DROP COLUMN slack_url,
        ADD COLUMN priority smallint NOT NULL DEFAULT 2
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE maintenance_request
        DROP COLUMN priority,
        ADD COLUMN slack_url VARCHAR(255),
        ADD COLUMN due_date TIMESTAMP WITH TIME ZONE
    `)
  }
}
