/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { SandboxLastActivity } from '@api/sandbox/entities/sandbox-last-activity.entity'
import { Runner } from '@api/sandbox/entities/runner.entity'
import {
  SandboxesController,
  SandboxesBulkController,
  SandboxesSearchController,
  SandboxSyncStatusController,
} from './controllers'
import {
  SandboxesService,
  SandboxesBulkService,
  SandboxesSearchService,
  SandboxSyncStatusService,
  SandboxResyncService,
} from './services'
import { AuthModule } from '../auth/auth.module'
import { SettingsModule } from '../chat/settings.module'
import { OpensearchService } from '../tools/opensearch/opensearch.service'

@Module({
  imports: [TypeOrmModule.forFeature([Sandbox, SandboxLastActivity, Runner]), AuthModule, SettingsModule],
  controllers: [SandboxesController, SandboxesBulkController, SandboxesSearchController, SandboxSyncStatusController],
  providers: [
    SandboxesService,
    SandboxesBulkService,
    SandboxesSearchService,
    SandboxSyncStatusService,
    SandboxResyncService,
    OpensearchService,
  ],
  exports: [SandboxesService, SandboxesBulkService, SandboxesSearchService],
})
export class SandboxesModule {}
