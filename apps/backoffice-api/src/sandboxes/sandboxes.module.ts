/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { SandboxLastActivity } from '@api/sandbox/entities/sandbox-last-activity.entity'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { SandboxesController, SandboxesBulkController, SandboxesSearchController } from './controllers'
import { SandboxesService, SandboxesBulkService, SandboxesSearchService } from './services'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TypeOrmModule.forFeature([Sandbox, SandboxLastActivity, Runner]), AuthModule],
  controllers: [SandboxesController, SandboxesBulkController, SandboxesSearchController],
  providers: [SandboxesService, SandboxesBulkService, SandboxesSearchService],
  exports: [SandboxesService, SandboxesBulkService, SandboxesSearchService],
})
export class SandboxesModule {}
