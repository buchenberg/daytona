/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class ReplaceShareLinksWithCollaborators1775059338377 implements MigrationInterface {
  name = 'ReplaceShareLinksWithCollaborators1775059338377'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mali_share_link`)

    await queryRunner.query(`
      CREATE TABLE mali_thread_collaborator (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES mali_conversation(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL,
        mode VARCHAR NOT NULL,
        granted_by VARCHAR NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(conversation_id, user_id)
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_mali_thread_collaborator_user ON mali_thread_collaborator(user_id)`)
    await queryRunner.query(
      `CREATE INDEX idx_mali_thread_collaborator_conv ON mali_thread_collaborator(conversation_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE mali_thread_collaborator`)

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
}
