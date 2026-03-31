/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SnapshotRunner } from '@api/sandbox/entities/snapshot-runner.entity'
import { SnapshotRegion } from '@api/sandbox/entities/snapshot-region.entity'
import { BuildInfo } from '@api/sandbox/entities/build-info.entity'
import { WarmPool } from '@api/sandbox/entities/warm-pool.entity'
import { Region } from '@api/region/entities/region.entity'
import { SnapshotsController, SnapshotsBulkController, SnapshotsSearchController } from './controllers'
import { SnapshotPropagationController } from './controllers/snapshot-propagation.controller'
import { SnapshotsService, SnapshotsBulkService, SnapshotsSearchService } from './services'
import { SnapshotPropagationService } from './services/snapshot-propagation.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Snapshot, SnapshotRunner, SnapshotRegion, BuildInfo, WarmPool, Region]),
    AuthModule,
  ],
  controllers: [SnapshotsController, SnapshotsBulkController, SnapshotsSearchController, SnapshotPropagationController],
  providers: [SnapshotsService, SnapshotsBulkService, SnapshotsSearchService, SnapshotPropagationService],
  exports: [SnapshotsService, SnapshotsBulkService, SnapshotsSearchService, SnapshotPropagationService],
})
export class SnapshotsModule {}
