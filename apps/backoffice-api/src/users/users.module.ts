/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './entities/user.entity'
import { UsersSearchController } from './controllers/users-search.controller'
import { UserDeletionController } from './controllers/user-deletion.controller'
import { UsersSearchService } from './services/users-search.service'
import { UserDeletionPreviewService } from './services/user-deletion-preview.service'
import { UserDeletionService } from './services/user-deletion.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [UsersSearchController, UserDeletionController],
  providers: [UsersSearchService, UserDeletionPreviewService, UserDeletionService],
  exports: [UsersSearchService, UserDeletionPreviewService, UserDeletionService],
})
export class UsersModule {}
