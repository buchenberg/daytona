/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { ToolRegistry } from './tool-registry'
import { GrafanaService } from './grafana/grafana.service'
import { DatabaseService } from './database/database.service'
import { ClickhouseService } from './clickhouse/clickhouse.service'
import { OpensearchService } from './opensearch/opensearch.service'
import { PosthogService } from './posthog/posthog.service'
import { SandboxService } from './sandbox/sandbox.service'

@Module({
  providers: [
    ToolRegistry,
    GrafanaService,
    DatabaseService,
    ClickhouseService,
    OpensearchService,
    PosthogService,
    SandboxService,
  ],
  exports: [ToolRegistry, GrafanaService],
})
export class ToolsModule {}
