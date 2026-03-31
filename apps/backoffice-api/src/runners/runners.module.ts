/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Runner } from '@api/sandbox/entities/runner.entity'
import {
  RunnersController,
  RunnersBulkController,
  RunnersBulkInsertController,
  RunnersSearchController,
} from './controllers'
import { RunnersService, RunnersBulkService, RunnersBulkInsertService, RunnersSearchService } from './services'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TypeOrmModule.forFeature([Runner]), AuthModule],
  controllers: [RunnersController, RunnersBulkController, RunnersBulkInsertController, RunnersSearchController],
  providers: [RunnersService, RunnersBulkService, RunnersBulkInsertService, RunnersSearchService],
  exports: [RunnersService, RunnersBulkService, RunnersBulkInsertService, RunnersSearchService],
})
export class RunnersModule {}
