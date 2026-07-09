/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm'
import { DatasourceOverrides } from '../dto/datasource-overrides.dto'

@Entity('mali_user_settings')
export class UserSettings {
  @PrimaryColumn({ name: 'user_id', type: 'varchar' })
  userId: string

  @Column({ name: 'datasource_overrides', type: 'jsonb', default: () => "'{}'::jsonb" })
  datasourceOverrides: DatasourceOverrides

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
