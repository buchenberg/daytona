/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { ToolsModule } from '../tools/tools.module'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ConversationsController } from './conversations.controller'
import { ConversationsService } from './conversations.service'
import { CollaboratorsService } from './collaborators.service'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'
import { Conversation } from './entities/conversation.entity'
import { Message } from './entities/message.entity'
import { UserSettings } from './entities/user-settings.entity'
import { ThreadCollaborator } from './entities/thread-collaborator.entity'
import { Memory } from './entities/memory.entity'
import { MemoryService } from './memory.service'
import { BackofficeUser } from '../backoffice-db/entities/backoffice-user.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Conversation, Message, UserSettings, ThreadCollaborator, Memory, BackofficeUser],
      'backoffice',
    ),
    AuthModule,
    ToolsModule,
  ],
  controllers: [ChatController, ConversationsController, SettingsController],
  providers: [ChatService, ConversationsService, CollaboratorsService, SettingsService, MemoryService],
})
export class ChatModule {}
