import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateQuotaBumpRequest1782717212908 implements MigrationInterface {
  name = 'CreateQuotaBumpRequest1782717212908'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE quota_bump_request (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR(255) NOT NULL,
        region_id VARCHAR(255) NOT NULL,
        sandbox_class VARCHAR(255) NOT NULL DEFAULT 'container',
        requested_by_id VARCHAR(255) NOT NULL,
        requested_by_email VARCHAR(255) NOT NULL,
        cpu_delta INTEGER NOT NULL DEFAULT 0,
        memory_delta INTEGER NOT NULL DEFAULT 0,
        disk_delta INTEGER NOT NULL DEFAULT 0,
        cpu_before INTEGER NOT NULL,
        memory_before INTEGER NOT NULL,
        disk_before INTEGER NOT NULL,
        cpu_after INTEGER NOT NULL,
        memory_after INTEGER NOT NULL,
        disk_after INTEGER NOT NULL,
        status VARCHAR(255) NOT NULL DEFAULT 'pending',
        reason TEXT,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        decided_by_id VARCHAR(255),
        decided_by_email VARCHAR(255),
        decided_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_quota_bump_request_status ON quota_bump_request(status)`)
    await queryRunner.query(`CREATE INDEX idx_quota_bump_request_expires_at ON quota_bump_request(expires_at)`)
    await queryRunner.query(
      `CREATE INDEX idx_quota_bump_request_target ON quota_bump_request(organization_id, region_id, sandbox_class)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_quota_bump_request_requester ON quota_bump_request(requested_by_id, created_at)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE quota_bump_request`)
  }
}
