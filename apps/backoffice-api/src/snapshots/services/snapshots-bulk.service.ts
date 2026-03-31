/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SnapshotsService } from './snapshots.service'
import { BulkUpdateSnapshotDto } from '../dto'
import { BulkUpdateResponseDto, BulkUpdateResultDto } from '../../common/dto'

@Injectable()
export class SnapshotsBulkService {
  constructor(
    @InjectRepository(Snapshot)
    private readonly snapshotRepository: Repository<Snapshot>,
    private readonly snapshotsService: SnapshotsService,
  ) {}

  async bulkUpdate(request: BulkUpdateSnapshotDto, userId: string): Promise<BulkUpdateResponseDto> {
    const results: BulkUpdateResultDto[] = []
    const globalWarnings: string[] = []

    // Fetch all snapshots
    const snapshots = await this.snapshotRepository.find({
      where: { id: In(request.ids) },
    })

    // Verify all IDs were found
    if (snapshots.length !== request.ids.length) {
      const foundIds = new Set(snapshots.map((s) => s.id))
      const missingIds = request.ids.filter((id) => !foundIds.has(id))
      missingIds.forEach((id) => {
        results.push({
          id,
          success: false,
          error: {
            code: 'ENTITY_001',
            message: 'Snapshot not found',
          },
        })
      })
    }

    // Process each snapshot
    for (const snapshot of snapshots) {
      try {
        if (request.dryRun) {
          const warnings = await this.snapshotsService.validateUpdate(snapshot, request.updates)
          globalWarnings.push(...warnings)
          results.push({
            id: snapshot.id,
            success: true,
            data: { ...snapshot, ...request.updates } as Snapshot,
          })
        } else {
          // Actually update
          const { snapshot: updated, warnings } = await this.snapshotsService.update(
            snapshot.id,
            { updates: request.updates },
            userId,
          )
          results.push({
            id: snapshot.id,
            success: true,
            data: updated,
          })
          globalWarnings.push(...warnings)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          id: snapshot.id,
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
