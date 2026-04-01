/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMaliSettingsAndShareLinks1775055574015 implements MigrationInterface {
  name = 'AddMaliSettingsAndShareLinks1775055574015'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mali_user_settings (
        user_id VARCHAR PRIMARY KEY,
        daytona_api_key VARCHAR,
        github_repo_url VARCHAR,
        github_pat VARCHAR,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    await queryRunner.query(`
      CREATE TABLE mali_share_link (
        token VARCHAR PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES mali_conversation(id) ON DELETE CASCADE,
        mode VARCHAR NOT NULL,
        created_by VARCHAR NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_mali_share_link_conv ON mali_share_link(conversation_id)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE mali_share_link`)
    await queryRunner.query(`DROP TABLE mali_user_settings`)
  }
}
