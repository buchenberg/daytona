/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class InitBackoffice1737100000000 implements MigrationInterface {
  name = 'InitBackoffice1737100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create audit_log table
    await queryRunner.query(`
      CREATE TABLE audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id VARCHAR(255) NOT NULL,
        actor_email VARCHAR(255) NOT NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id VARCHAR(255),
        status_code INTEGER,
        error_message TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_audit_log_actor_email ON audit_log(actor_email)`)
    await queryRunner.query(`CREATE INDEX idx_audit_log_created_at ON audit_log(created_at)`)
    await queryRunner.query(`CREATE INDEX idx_audit_log_action ON audit_log(action)`)
    await queryRunner.query(`CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id)`)

    // Create backoffice_user table
    await queryRunner.query(`
      CREATE TABLE backoffice_user (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'admin',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login_at TIMESTAMP WITH TIME ZONE,
        created_by VARCHAR(255)
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_backoffice_user_email ON backoffice_user(email)`)
    await queryRunner.query(`CREATE INDEX idx_backoffice_user_is_active ON backoffice_user(is_active)`)

    // Seed initial admin (update with your email)
    await queryRunner.query(`
      INSERT INTO backoffice_user (email, name, role, created_by) 
      VALUES ('admin@daytona.io', 'Initial Admin', 'admin', 'system')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE backoffice_user`)
    await queryRunner.query(`DROP TABLE audit_log`)
  }
}
