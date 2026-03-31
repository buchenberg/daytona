/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { RunnersService } from './runners.service'
import { BulkUpdateRunnerDto } from '../dto'
import { BulkUpdateResponseDto, BulkUpdateResultDto } from '../../common/dto'

@Injectable()
export class RunnersBulkService {
  constructor(
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
    private readonly runnersService: RunnersService,
  ) {}

  async bulkUpdate(request: BulkUpdateRunnerDto, userId: string): Promise<BulkUpdateResponseDto> {
    const results: BulkUpdateResultDto[] = []
    const globalWarnings: string[] = []

    // Fetch all runners
    const runners = await this.runnerRepository.find({
      where: { id: In(request.ids) },
    })

    // Verify all IDs were found
    if (runners.length !== request.ids.length) {
      const foundIds = new Set(runners.map((r) => r.id))
      const missingIds = request.ids.filter((id) => !foundIds.has(id))
      missingIds.forEach((id) => {
        results.push({
          id,
          success: false,
          error: {
            code: 'ENTITY_001',
            message: 'Runner not found',
          },
        })
      })
    }

    // Process each runner
    for (const runner of runners) {
      try {
        if (request.dryRun) {
          const warnings = this.runnersService.validateUpdate(runner, request.updates)
          globalWarnings.push(...warnings)
          results.push({
            id: runner.id,
            success: true,
            data: { ...runner, ...request.updates } as Runner,
          })
        } else {
          // Actually update
          const { runner: updated, warnings } = await this.runnersService.update(
            runner.id,
            { updates: request.updates },
            userId,
          )
          results.push({
            id: runner.id,
            success: true,
            data: updated,
          })
          globalWarnings.push(...warnings)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          id: runner.id,
          success: false,
          error: {
            code: 'UPDATE_ERROR',
            message: errorMessage,
          },
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failureCount = results.filter((r) => !r.success).length

    return {
      totalProcessed: results.length,
      successCount,
      failureCount,
      results,
      warnings: [...new Set(globalWarnings)], // Deduplicate warnings
    }
  }
}
