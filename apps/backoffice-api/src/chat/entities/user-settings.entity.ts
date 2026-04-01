/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm'

@Entity('mali_user_settings')
export class UserSettings {
  @PrimaryColumn({ name: 'user_id', type: 'varchar' })
  userId: string

  @Column({ name: 'daytona_api_key', type: 'varchar', nullable: true })
  daytonaApiKey: string | null

  @Column({ name: 'github_repo_url', type: 'varchar', nullable: true })
  githubRepoUrl: string | null

  @Column({ name: 'github_pat', type: 'varchar', nullable: true })
  githubPat: string | null

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
