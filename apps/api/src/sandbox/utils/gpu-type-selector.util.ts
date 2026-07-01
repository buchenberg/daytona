/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { GpuType } from '../enums/gpu-type.enum'

export interface GpuTypeSelectorInput {
  gpu: number
  gpuType?: GpuType | null
  gpuTypePreferences?: GpuType[] | null
}

/**
 * GPU type constraint to apply when (re)assigning a runner to a sandbox.
 *
 * A concrete, already-pinned `gpuType` always wins. Otherwise the requested
 * preference list is used, so a declarative GPU build that fell back to
 * PENDING_BUILD (where `gpuType` is not yet pinned to a runner) still lands on a
 * runner of the requested type instead of any available GPU runner.
 *
 * @returns `null` for non-GPU sandboxes or when no GPU type was requested.
 */
export function resolveGpuTypeSelector(sandbox: GpuTypeSelectorInput): GpuType | GpuType[] | null {
  if (sandbox.gpu <= 0) {
    return null
  }
  if (sandbox.gpuType) {
    return sandbox.gpuType
  }
  if (sandbox.gpuTypePreferences && sandbox.gpuTypePreferences.length > 0) {
    return sandbox.gpuTypePreferences
  }
  return null
}

/**
 * Whether a runner's actual GPU type satisfies the given selector. Used when
 * iterating candidate runners manually (e.g. the snapshot-runner fallback) to
 * mirror the filtering done by the scheduler.
 */
export function runnerMatchesGpuTypeSelector(
  runnerGpuType: GpuType | null | undefined,
  selector: GpuType | GpuType[] | null,
): boolean {
  if (selector === null) {
    return true
  }
  const normalizedRunnerGpuType = runnerGpuType ?? null
  if (Array.isArray(selector)) {
    return normalizedRunnerGpuType !== null && selector.includes(normalizedRunnerGpuType)
  }
  return normalizedRunnerGpuType === selector
}

/**
 * Concrete GPU type to persist once a runner is chosen. Pins the sandbox to the
 * assigned runner's actual GPU type when it is not yet pinned (the PENDING_BUILD
 * path), keeping billing and the sandbox DTO accurate.
 *
 * @returns the runner's GPU type to persist, or `undefined` when there is
 *   nothing to update.
 */
export function resolvePinnedGpuType(
  sandbox: { gpu: number; gpuType?: GpuType | null },
  runnerGpuType: GpuType | null | undefined,
): GpuType | undefined {
  if (sandbox.gpu <= 0 || !runnerGpuType || sandbox.gpuType === runnerGpuType) {
    return undefined
  }
  return runnerGpuType
}
