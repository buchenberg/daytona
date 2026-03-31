/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { RunnerState } from '@api/sandbox/enums/runner-state.enum'
import { UpdateRunnerDto } from '../dto/update-runner.dto'
import { PatchRunnerDto } from '../dto/patch-runner.dto'
import { updateWithPreconditions } from '../../common/preconditions.util'

@Injectable()
export class RunnersService {
  constructor(
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
  ) {}

  async update(id: string, patchData: PatchRunnerDto, userId: string): Promise<{ runner: Runner; warnings: string[] }> {
    // Fetch runner
    const runner = await this.runnerRepository.findOne({
      where: { id },
    })

    if (!runner) {
      throw new Error('Runner not found')
    }

    const updateData = patchData.updates

    // Validate business rules against current state
    const warnings = this.validateUpdate(runner, updateData)

    // Atomic update: UPDATE ... SET updates WHERE id = ? AND preconditions
    const updated = await updateWithPreconditions(this.runnerRepository, { id }, updateData, patchData.preconditions)

    return { runner: updated, warnings }
  }

  validateUpdate(runner: Runner, updateData: UpdateRunnerDto): string[] {
    const warnings: string[] = []

    // Cannot edit DECOMMISSIONED runners
    if (runner.state === RunnerState.DECOMMISSIONED) {
      throw new Error('Cannot edit runners in DECOMMISSIONED state')
    }

    // Validate state transitions
    if (updateData.state && updateData.state !== runner.state) {
      const warning = this.validateStateTransition(runner.state, updateData.state)
      if (warning) {
        warnings.push(warning)
      }
    }

    // Warn if marking ready runner as unschedulable
    if (updateData.unschedulable === true && runner.state === RunnerState.READY) {
      warnings.push('Marking a READY runner as unschedulable will prevent new sandboxes from being assigned')
    }

    return warnings
  }

  private validateStateTransition(currentState: RunnerState, newState: RunnerState): string | null {
    // Define unusual state transitions that should generate warnings
    const unusualTransitions: Record<RunnerState, RunnerState[]> = {
      [RunnerState.READY]: [RunnerState.INITIALIZING], // Going back to INITIALIZING is unusual
      [RunnerState.DISABLED]: [RunnerState.INITIALIZING], // Disabled shouldn't go to INITIALIZING
      [RunnerState.DECOMMISSIONED]: [
        // DECOMMISSIONED is terminal
        RunnerState.INITIALIZING,
        RunnerState.READY,
        RunnerState.DISABLED,
        RunnerState.UNRESPONSIVE,
      ],
      [RunnerState.UNRESPONSIVE]: [], // UNRESPONSIVE can transition anywhere
      [RunnerState.INITIALIZING]: [], // INITIALIZING can transition anywhere
    }

    const unusual = unusualTransitions[currentState]
    if (unusual && unusual.includes(newState)) {
      return `State transition from ${currentState} to ${newState} is unusual and may cause issues`
    }

    return null
  }
}
