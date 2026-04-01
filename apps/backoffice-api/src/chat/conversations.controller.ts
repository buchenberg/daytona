/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity, ApiQuery } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../common/guards/flexible-auth.guard'
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface'
import { ConversationsService } from './conversations.service'
import { CollaboratorsService } from './collaborators.service'
import { UpdateConversationDto } from './dto/update-conversation.dto'
import { AddCollaboratorDto } from './dto/add-collaborator.dto'

@ApiTags('conversations')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly collaboratorsService: CollaboratorsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create empty conversation' })
  async create(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.conversationsService.create(userId)
  }

  @Get()
  @ApiOperation({ summary: 'List conversations (owned + collaborated)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const userId = req.user?.id || 'anonymous'
    return this.conversationsService.list(userId, limit ? parseInt(limit, 10) : 50, offset ? parseInt(offset, 10) : 0)
  }

  @Get('users')
  @ApiOperation({ summary: 'List backoffice users for collaborator picker' })
  async listUsers() {
    return this.collaboratorsService.listUsers()
  }

  @Delete(':id/messages')
  @ApiOperation({ summary: 'Delete messages after a certain point (for edit/reset)' })
  @ApiQuery({ name: 'keepCount', required: true, type: Number })
  async deleteMessages(
    @Param('id') id: string,
    @Query('keepCount') keepCount: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id || 'anonymous'
    return this.conversationsService.deleteMessagesAfter(id, userId, parseInt(keepCount, 10))
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation with messages in assistant-ui format' })
  async get(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.conversationsService.getWithMessages(id, userId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename conversation' })
  async rename(@Param('id') id: string, @Body() body: UpdateConversationDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.conversationsService.rename(id, userId, body.title)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete conversation' })
  async delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.conversationsService.delete(id, userId)
  }

  @Post(':id/collaborators')
  @ApiOperation({ summary: 'Add collaborator to conversation' })
  async addCollaborator(@Param('id') id: string, @Body() body: AddCollaboratorDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.collaboratorsService.addCollaborator(id, body.userId, body.mode, userId)
  }

  @Get(':id/collaborators')
  @ApiOperation({ summary: 'List collaborators for conversation' })
  async listCollaborators(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.collaboratorsService.listCollaborators(id, userId)
  }

  @Delete(':id/collaborators/:targetUserId')
  @ApiOperation({ summary: 'Remove collaborator from conversation' })
  async removeCollaborator(
    @Param('id') id: string,
    @Param('targetUserId') targetUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id || 'anonymous'
    return this.collaboratorsService.removeCollaborator(id, targetUserId, userId)
  }
}
