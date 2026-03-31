/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SnapshotPropagationRequestDto } from '../dto/snapshot-propagation-request.dto'
import { SnapshotPropagationResponseDto, SnapshotPropagationStatusDto } from '../dto/snapshot-propagation-response.dto'

@Injectable()
export class SnapshotPropagationService {
  constructor(
    @InjectRepository(Snapshot)
    private readonly snapshotRepository: Repository<Snapshot>,
    private readonly dataSource: DataSource,
  ) {}

  async propagate(
    snapshotId: string,
    requestDto: SnapshotPropagationRequestDto,
  ): Promise<SnapshotPropagationResponseDto> {
    // Find the snapshot to get its internalName (snapshotRef)
    let snapshot
    try {
      snapshot = await this.snapshotRepository.findOne({ where: { id: snapshotId } })
    } catch (error) {
      // Invalid UUID format
      throw new NotFoundException(`Snapshot with ID ${snapshotId} not found`)
    }

    if (!snapshot) {
      throw new NotFoundException(`Snapshot with ID ${snapshotId} not found`)
    }

    const snapshotRef = snapshot.imageName // This is the internal reference used in snapshot_runner

    const { region, maxRunners = 25, dryRun = false } = requestDto
    const warnings: string[] = []

    // Find eligible runners
    const eligibleQuery = `
      SELECT r.id
      FROM runner r
      WHERE r.unschedulable = FALSE
        AND r.region = $1
        AND r.state = 'ready'
        AND NOT EXISTS (
          SELECT 1
          FROM snapshot_runner sr
          WHERE sr."runnerId" = r.id::text
            AND sr."snapshotRef" = $2
        )
      ORDER BY r.id
      LIMIT $3
    `

    const eligibleRunners = await this.dataSource.query(eligibleQuery, [region, snapshotRef, maxRunners])
    const eligibleCount = eligibleRunners.length

    let insertedCount = 0

    if (!dryRun && eligibleCount > 0) {
      // Backdate timestamps by 40 minutes to mimic SQL script behavior
      const backdatedTime = new Date(Date.now() - 40 * 60 * 1000)

      // Insert records into snapshot_runner table (convert UUIDs to strings)
      const runnerIds = eligibleRunners.map((r: any) => String(r.id))

      const insertQuery = `
        INSERT INTO snapshot_runner ("runnerId", "errorReason", "snapshotRef", "createdAt", "updatedAt", "state")
        SELECT 
          unnest($1::text[]),
          NULL,
          $2,
          $3,
          $3,
          'pulling_snapshot'
        ON CONFLICT DO NOTHING
      `

      const result = await this.dataSource.query(insertQuery, [runnerIds, snapshotRef, backdatedTime])
      insertedCount = result[1] || 0
    }

    // Query current status
    const statusQuery = `
      SELECT state, COUNT(*) as count
      FROM snapshot_runner
      WHERE "snapshotRef" = $1
      GROUP BY state
    `
    const statusResults = await this.dataSource.query(statusQuery, [snapshotRef])

    const currentStatus: SnapshotPropagationStatusDto = {
      ready: 0,
      pulling_snapshot: 0,
      failed: 0,
    }

    statusResults.forEach((row: any) => {
      const count = parseInt(row.count, 10)
      if (row.state === 'ready') {
        currentStatus.ready = count
      } else if (row.state === 'pulling_snapshot') {
        currentStatus.pulling_snapshot = count
      } else if (row.state === 'failed') {
        currentStatus.failed = count
      }
    })

    if (eligibleCount === 0) {
      warnings.push('No eligible runners found in the specified region')
    }

    if (dryRun) {
      warnings.push('Dry run mode - no records were inserted')
    }

    if (eligibleCount < maxRunners) {
      warnings.push(`Only ${eligibleCount} eligible runners found (requested: ${maxRunners})`)
    }

    return {
      success: true,
      snapshotRef,
      region,
      eligibleRunners: eligibleCount,
      insertedRecords: insertedCount,
      currentStatus,
      warnings,
    }
  }
}
