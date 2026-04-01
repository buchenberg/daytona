/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, Req, Res, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { Response } from 'express'
import { FlexibleAuthGuard } from '../common/guards/flexible-auth.guard'
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface'
import { ChatService } from './chat.service'
import { ChatRequestDto, StopChatRequestDto, ContinueChatRequestDto } from './dto/chat-request.dto'

@ApiTags('chat')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream a chat response via SSE' })
  async stream(@Body() body: ChatRequestDto, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    const userId = req.user?.id || 'anonymous'

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

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    req.on('close', () => {
      this.chatService.stopStream(body.conversationId)
    })

    const generator = this.chatService.streamContinue(body.conversationId, userId)

    for await (const chunk of generator) {
      if (res.writableEnded) break
      res.write(chunk)
    }

    if (!res.writableEnded) res.end()
  }
}
