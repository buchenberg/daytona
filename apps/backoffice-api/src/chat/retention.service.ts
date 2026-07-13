/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { ConfigService } from '@nestjs/config'
import { ConversationsService } from './conversations.service'
import { MemoryService } from './memory.service'

/**
 * Nightly sweep: deletes unpinned conversations idle past the retention
 * window (messages/collaborators cascade) and prunes stale memory entries.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name)
  private readonly retentionDays: number

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly memoryService: MemoryService,
  ) {
    this.retentionDays = parseInt(this.configService.get<string>('mali.conversationRetentionDays') || '14', 10)
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep(): Promise<void> {
    // Conversation retention can be disabled; memory cleanup always runs.
    if (Number.isFinite(this.retentionDays) && this.retentionDays > 0) {
      const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000)
      try {
        const deleted = await this.conversationsService.deleteUnpinnedOlderThan(cutoff)
        if (deleted > 0) {
          this.logger.log(`[retention] Deleted ${deleted} conversations older than ${this.retentionDays} days`)
        }
      } catch (err) {
        this.logger.error(`[retention] Conversation sweep failed: ${err instanceof Error ? err.message : err}`)
      }
    }

    try {
      const pruned = await this.memoryService.cleanup()
      if (pruned > 0) {
        this.logger.log(`[retention] Pruned ${pruned} stale memory entries`)
      }
    } catch (err) {
      this.logger.error(`[retention] Memory cleanup failed: ${err instanceof Error ? err.message : err}`)
    }
  }
}
