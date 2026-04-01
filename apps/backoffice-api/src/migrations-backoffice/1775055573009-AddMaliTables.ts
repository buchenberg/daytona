/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMaliTables1775055573009 implements MigrationInterface {
  name = 'AddMaliTables1775055573009'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mali_conversation (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR NOT NULL DEFAULT 'New conversation',
        user_id VARCHAR NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_mali_conversation_updated_at ON mali_conversation(updated_at DESC)`)
    await queryRunner.query(`CREATE INDEX idx_mali_conversation_user_id ON mali_conversation(user_id)`)

    await queryRunner.query(`
      CREATE TABLE mali_message (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES mali_conversation(id) ON DELETE CASCADE,
        role VARCHAR NOT NULL,
        content JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_mali_message_conv_created ON mali_message(conversation_id, created_at)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE mali_message`)
    await queryRunner.query(`DROP TABLE mali_conversation`)
  }
}
