/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { SandboxState } from '@api/sandbox/enums/sandbox-state.enum'
import { SandboxDesiredState } from '@api/sandbox/enums/sandbox-desired-state.enum'
import { RunnerState } from '@api/sandbox/enums/runner-state.enum'
import { UpdateSandboxDto } from '../dto/update-sandbox.dto'
import { PatchSandboxDto } from '../dto/patch-sandbox.dto'
import { updateWithPreconditions } from '../../common/preconditions.util'

@Injectable()
export class SandboxesService {
  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepository: Repository<Sandbox>,
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
  ) {}

  async update(
    id: string,
    patchData: PatchSandboxDto,
    userId: string,
  ): Promise<{ sandbox: Sandbox; warnings: string[] }> {
    // Fetch sandbox
    const sandbox = await this.sandboxRepository.findOne({
      where: { id },
    })

    if (!sandbox) {
      throw new Error('Sandbox not found')
    }

    const updateData = patchData.updates

    // Validate business rules against current state
    const warnings = await this.validateUpdate(sandbox, updateData)

    // Atomic update: UPDATE ... SET updates WHERE id = ? AND preconditions
    const updated = await updateWithPreconditions(this.sandboxRepository, { id }, updateData, patchData.preconditions)

    return { sandbox: updated, warnings }
  }

  async validateUpdate(sandbox: Sandbox, updateData: UpdateSandboxDto): Promise<string[]> {
    const warnings: string[] = []

    // Cannot edit DESTROYED sandboxes
    if (sandbox.state === SandboxState.DESTROYED) {
      throw new Error('Cannot edit sandboxes in DESTROYED state')
    }

    // Validate desired state transitions
    if (updateData.desiredState && updateData.desiredState !== sandbox.desiredState) {
      this.validateDesiredStateTransition(sandbox.state, updateData.desiredState)
    }

    // Validate runner assignment
    if (updateData.runnerId && updateData.runnerId !== sandbox.runnerId) {
      await this.validateRunnerAssignment(sandbox, updateData.runnerId)
    }

    // Validate network allowlist
    if (updateData.networkAllowList && !updateData.networkBlockAll && !sandbox.networkBlockAll) {
      warnings.push('networkAllowList only applies when networkBlockAll is true')
    }

    // Validate labels
    if (updateData.labels) {
      this.validateLabels(updateData.labels)
    }

    // Validate auto-intervals
    if (updateData.autoDeleteInterval !== undefined && updateData.autoDeleteInterval < -1) {
      throw new Error('autoDeleteInterval must be >= -1')
    }

    return warnings
  }

  private validateDesiredStateTransition(currentState: SandboxState, desiredState: SandboxDesiredState): void {
    const validTransitions: Record<SandboxDesiredState, SandboxState[]> = {
      [SandboxDesiredState.STARTED]: [
        SandboxState.STOPPED,
        SandboxState.ARCHIVED,
        SandboxState.UNKNOWN,
        SandboxState.ERROR,
        SandboxState.BUILD_FAILED,
        SandboxState.STARTING,
        SandboxState.CREATING,
        SandboxState.RESTORING,
        SandboxState.PENDING_BUILD,
        SandboxState.BUILDING_SNAPSHOT,
        SandboxState.PULLING_SNAPSHOT,
        SandboxState.ARCHIVING,
      ],
      [SandboxDesiredState.STOPPED]: [
        SandboxState.STARTED,
        SandboxState.STOPPING,
        SandboxState.STOPPED,
        SandboxState.ERROR,
        SandboxState.BUILD_FAILED,
      ],
      [SandboxDesiredState.ARCHIVED]: [
        SandboxState.ARCHIVED,
        SandboxState.ARCHIVING,
        SandboxState.STOPPED,
        SandboxState.ERROR,
        SandboxState.BUILD_FAILED,
      ],
      [SandboxDesiredState.RESIZED]: [SandboxState.STARTED, SandboxState.STOPPED],
      [SandboxDesiredState.DESTROYED]: [
        SandboxState.DESTROYED,
        SandboxState.DESTROYING,
        SandboxState.STOPPED,
        SandboxState.STARTED,
        SandboxState.ARCHIVED,
        SandboxState.ERROR,
        SandboxState.BUILD_FAILED,
        SandboxState.ARCHIVING,
      ],
    }

    const allowedStates = validTransitions[desiredState]
    if (!allowedStates || !allowedStates.includes(currentState)) {
      throw new Error(`Cannot transition to ${desiredState} from ${currentState}`)
    }
  }

  private async validateRunnerAssignment(sandbox: Sandbox, runnerId: string): Promise<void> {
    const runner = await this.runnerRepository.findOne({
      where: { id: runnerId },
    })

    if (!runner) {
      throw new Error('Runner not found')
    }

    if (runner.state !== RunnerState.READY) {
      throw new Error('Runner is not in READY state')
    }

    if (runner.region !== sandbox.region) {
      throw new Error('Runner region does not match sandbox region')
    }

    if (runner.unschedulable) {
      throw new Error('Runner is marked as unschedulable')
    }

    // Check runner capacity
    const currentUsage = await this.calculateRunnerUsage(runnerId)
    if (
      currentUsage.cpu + sandbox.cpu > runner.cpu ||
      currentUsage.mem + sandbox.mem > runner.memoryGiB ||
      currentUsage.disk + sandbox.disk > runner.diskGiB
    ) {
      throw new Error('Runner does not have sufficient capacity')
    }
  }

  private validateLabels(labels: Record<string, string>): void {
    Object.entries(labels).forEach(([key, value]) => {
      if (key.length > 255) {
        throw new Error('Label key exceeds 255 characters')
      }
      if (value.length > 255) {
        throw new Error('Label value exceeds 255 characters')
      }
    })
  }

  private async calculateRunnerUsage(runnerId: string): Promise<{ cpu: number; mem: number; disk: number }> {
    const sandboxes = await this.sandboxRepository.find({
      where: { runnerId },
    })

    return sandboxes.reduce(
      (acc, s) => ({
        cpu: acc.cpu + s.cpu,
        mem: acc.mem + s.mem,
        disk: acc.disk + s.disk,
      }),
      { cpu: 0, mem: 0, disk: 0 },
    )
  }
}
