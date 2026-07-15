import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateFleetTables1784040620209 implements MigrationInterface {
  name = 'CreateFleetTables1784040620209'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fleet_runner (
        name VARCHAR(255) PRIMARY KEY,
        source VARCHAR(255) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        env VARCHAR(255) NOT NULL,
        provider VARCHAR(255),
        server_type VARCHAR(255),
        os VARCHAR(255),
        ip VARCHAR(255),
        geo VARCHAR(255),
        region VARCHAR(255),
        location VARCHAR(255),
        model VARCHAR(255),
        nic_speed VARCHAR(255),
        monthly_cost NUMERIC(12,2),
        hourly_cost NUMERIC(12,2),
        tenant VARCHAR(255),
        gpu BOOLEAN NOT NULL DEFAULT FALSE,
        groups TEXT[] NOT NULL DEFAULT '{}',
        domain VARCHAR(255),
        provisioned_at TIMESTAMP WITH TIME ZONE,
        removed_at TIMESTAMP WITH TIME ZONE,
        last_sync_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_fleet_runner_env ON fleet_runner(env)`)
    await queryRunner.query(`CREATE INDEX idx_fleet_runner_domain ON fleet_runner(domain)`)

    await queryRunner.query(`
      CREATE TABLE maintenance_request (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type VARCHAR(255) NOT NULL,
        status VARCHAR(255) NOT NULL DEFAULT 'requested',
        runner_names TEXT[] NOT NULL,
        requested_by VARCHAR(255) NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        slack_url VARCHAR(255),
        due_date TIMESTAMP WITH TIME ZONE,
        closed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_maintenance_request_status ON maintenance_request(status)`)

    await queryRunner.query(`
      CREATE TABLE fleet_runner_event (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        runner_name VARCHAR(255),
        type VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        request_id UUID REFERENCES maintenance_request(id),
        actor VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_fleet_runner_event_runner_name ON fleet_runner_event(runner_name)`)
    await queryRunner.query(`CREATE INDEX idx_fleet_runner_event_request_id ON fleet_runner_event(request_id)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE fleet_runner_event`)
    await queryRunner.query(`DROP TABLE maintenance_request`)
    await queryRunner.query(`DROP TABLE fleet_runner`)
  }
}
