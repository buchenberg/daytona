/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { SandboxesService } from './sandboxes.service'
import { BulkUpdateSandboxDto } from '../dto'
import { BulkUpdateResponseDto, BulkUpdateResultDto } from '../../common/dto'

@Injectable()
export class SandboxesBulkService {
  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepository: Repository<Sandbox>,
    private readonly sandboxesService: SandboxesService,
  ) {}

  async bulkUpdate(request: BulkUpdateSandboxDto, userId: string): Promise<BulkUpdateResponseDto> {
    const results: BulkUpdateResultDto[] = []
    const globalWarnings: string[] = []

    // Fetch all sandboxes
    const sandboxes = await this.sandboxRepository.find({
      where: { id: In(request.ids) },
    })

    // Verify all IDs were found
    if (sandboxes.length !== request.ids.length) {
      const foundIds = new Set(sandboxes.map((s) => s.id))
      const missingIds = request.ids.filter((id) => !foundIds.has(id))
      missingIds.forEach((id) => {
        results.push({
          id,
          success: false,
          error: {
            code: 'ENTITY_001',
            message: 'Sandbox not found',
          },
        })
      })
    }

    // Process each sandbox
    for (const sandbox of sandboxes) {
      try {
        if (request.dryRun) {
          const warnings = await this.sandboxesService.validateUpdate(sandbox, request.updates)
          globalWarnings.push(...warnings)
          results.push({
            id: sandbox.id,
            success: true,
            data: { ...sandbox, ...request.updates } as Sandbox,
          })
        } else {
          // Actually update
          const { sandbox: updated, warnings } = await this.sandboxesService.update(
            sandbox.id,
            { updates: request.updates },
            userId,
          )
          results.push({
            id: sandbox.id,
            success: true,
            data: updated,
          })
          globalWarnings.push(...warnings)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          id: sandbox.id,
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
