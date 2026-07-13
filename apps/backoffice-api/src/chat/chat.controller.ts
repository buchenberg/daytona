/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Get, Param, Body, Req, Res, UseGuards, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { Response } from 'express'
import { FlexibleAuthGuard } from '../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../common/guards/permissions.guard'
import { RequirePermission } from '../common/decorators/require-permission.decorator'
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface'
import { ChatService } from './chat.service'
import { MemoryService } from './memory.service'
import { ChatRequestDto, StopChatRequestDto, ContinueChatRequestDto } from './dto/chat-request.dto'
import { UpsertMemoryDto } from './dto/upsert-memory.dto'
import { isSuperAdmin } from '../common/permissions'

@ApiTags('chat')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@RequirePermission(['maliDatasources', '*'])
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly memoryService: MemoryService,
  ) {}

  @Post('stream')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream a chat response via SSE' })
  async stream(@Body() body: ChatRequestDto, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    const userId = req.user?.id || 'anonymous'
    const permissions = req.user?.permissions ?? {}

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    let resolvedConversationId: string | undefined

    const generator = this.chatService.streamChat({
      conversationId: body.conversationId,
      message: body.message,
      userId,
      permissions,
    })

    req.on('close', () => {
      if (resolvedConversationId) {
        this.chatService.stopStream(resolvedConversationId)
      }
    })

    for await (const chunk of generator) {
      if (res.writableEnded) break
      res.write(chunk)
      if (!resolvedConversationId) {
        try {
          const data = JSON.parse(chunk.replace('data: ', '').trim())
          resolvedConversationId = data.conversationId
        } catch {
          /* ignore parse errors */
        }
      }
    }

    if (!res.writableEnded) res.end()
  }

  @Post('stop')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stop an in-progress chat stream' })
  async stop(@Body() body: StopChatRequestDto) {
    const stopped = this.chatService.stopStream(body.conversationId)
    return { success: stopped }
  }

  @Post('continue')
  @SkipThrottle()
  @ApiOperation({ summary: 'Continue a conversation after max_rounds' })
  async continueChat(@Body() body: ContinueChatRequestDto, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    const userId = req.user?.id || 'anonymous'
    const permissions = req.user?.permissions ?? {}

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    req.on('close', () => {
      this.chatService.stopStream(body.conversationId)
    })

    const generator = this.chatService.streamContinue(body.conversationId, userId, permissions)

    for await (const chunk of generator) {
      if (res.writableEnded) break
      res.write(chunk)
    }

    if (!res.writableEnded) res.end()
  }

  @Get('suggestions/:conversationId')
  @ApiOperation({ summary: 'Generate follow-up suggestions for a conversation' })
  async suggestions(@Param('conversationId') conversationId: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    const suggestions = await this.chatService.generateSuggestions(conversationId, userId)
    return { suggestions }
  }

  @Post('compact/:conversationId')
  @ApiOperation({ summary: 'Compact conversation history by summarizing old messages' })
  async compact(@Param('conversationId') conversationId: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.chatService.compactConversation(conversationId, userId)
  }

  @Post('remember/:conversationId')
  @ApiOperation({ summary: 'Extract and store a memory from recent conversation messages' })
  async remember(@Param('conversationId') conversationId: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    const memory = await this.memoryService.rememberFromConversation(conversationId, userId)
    return memory ? { success: true, key: memory.key, value: memory.value } : { success: false }
  }

  @Get('memories')
  @ApiOperation({ summary: 'List all shared memory entries' })
  async listMemories() {
    const memories = await this.memoryService.list()
    return { memories }
  }

  // The knowledge base is injected into every user's system prompt, so
  // curating it over HTTP is restricted to superadmins. (Mali itself can
  // still store/forget entries via its tools during a conversation.)
  @Post('memories')
  @ApiOperation({ summary: 'Create or update a knowledge base entry (superadmin only)' })
  async upsertMemory(@Body() body: UpsertMemoryDto, @Req() req: AuthenticatedRequest) {
    if (!isSuperAdmin(req.user?.permissions)) throw new ForbiddenException('Superadmin only')
    const userId = req.user?.id || 'anonymous'
    const memory = await this.memoryService.store(userId, body.key, body.value, body.category ?? 'curated')
    return { success: true, memory }
  }

  @Post('forget')
  @ApiOperation({ summary: 'Delete a memory entry by key (superadmin only)' })
  async forget(@Body() body: { key: string }, @Req() req: AuthenticatedRequest) {
    if (!isSuperAdmin(req.user?.permissions)) throw new ForbiddenException('Superadmin only')
    const deleted = await this.memoryService.forget(body.key)
    return { success: deleted }
  }
}
