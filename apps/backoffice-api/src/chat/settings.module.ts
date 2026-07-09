/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SettingsService } from './settings.service'
import { UserSettings } from './entities/user-settings.entity'

/**
 * Separate module so ToolsModule (which needs SettingsService to resolve
 * per-user datasource overrides) can import it without depending on the whole
 * ChatModule — which in turn imports ToolsModule, creating a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserSettings], 'backoffice')],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
