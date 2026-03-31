/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SnapshotState } from '@api/sandbox/enums/snapshot-state.enum'
import { UpdateSnapshotDto } from '../dto/update-snapshot.dto'
import { PatchSnapshotDto } from '../dto/patch-snapshot.dto'
import { updateWithPreconditions } from '../../common/preconditions.util'

@Injectable()
export class SnapshotsService {
  constructor(
    @InjectRepository(Snapshot)
    private readonly snapshotRepository: Repository<Snapshot>,
  ) {}

  async update(
    id: string,
    patchData: PatchSnapshotDto,
    userId: string,
  ): Promise<{ snapshot: Snapshot; warnings: string[] }> {
    // Fetch snapshot
    const snapshot = await this.snapshotRepository.findOne({
      where: { id },
    })

    if (!snapshot) {
      throw new Error('Snapshot not found')
    }

    const updateData = patchData.updates

    // Validate business rules against current state
    const warnings = await this.validateUpdate(snapshot, updateData)

    // Atomic update: UPDATE ... SET updates WHERE id = ? AND preconditions
    const updated = await updateWithPreconditions(this.snapshotRepository, { id }, updateData, patchData.preconditions)

    return { snapshot: updated, warnings }
  }

  async validateUpdate(snapshot: Snapshot, updateData: UpdateSnapshotDto): Promise<string[]> {
    const warnings: string[] = []

    // Cannot edit REMOVING snapshots
    if (snapshot.state === SnapshotState.REMOVING) {
      throw new Error('Cannot edit snapshots in REMOVING state')
    }

    // Validate name uniqueness if changing name
    if (updateData.name && updateData.name !== snapshot.name) {
      const existing = await this.snapshotRepository.findOne({
        where: { name: updateData.name },
      })
      if (existing) {
        throw new Error(`Snapshot with name "${updateData.name}" already exists`)
      }
    }

    // Warn if making general snapshot non-general
    if (snapshot.general === true && updateData.general === false) {
      warnings.push('Changing general snapshot to non-general may affect existing sandboxes using this snapshot')
    }

    // Warn if hiding snapshot that's currently in use
    if (updateData.hideFromUsers === true && !snapshot.hideFromUsers) {
      warnings.push('Hiding this snapshot will prevent users from selecting it for new sandboxes')
    }

    return warnings
  }
}
