/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

/**
 * Pure policy checks for temporary region-quota bumps. Kept side-effect free so
 * they are trivially unit-testable; the service turns any returned violation
 * strings into a ForbiddenException.
 */

export interface BumpAmounts {
  cpu: number
  memory: number
  disk: number
}

const FIELD_LABELS: Record<keyof BumpAmounts, string> = {
  cpu: 'CPU',
  memory: 'Memory (GiB)',
  disk: 'Disk (GiB)',
}

/**
 * Largest delta allowed for a single field per bump: the GREATER of `maxPercent`%
 * of the current value (floored) and the flat per-field allowance `flatIncrease`,
 * so small or zero quotas can still get a useful bump. The per-editor daily budget
 * (checked separately) is the real upper bound.
 */
export function maxDeltaForPercentCap(current: number, maxPercent: number, flatIncrease = 0): number {
  return Math.max(Math.floor((current * maxPercent) / 100), flatIncrease)
}

/**
 * Each requested delta may not exceed the per-bump limit for its field — the
 * greater of `maxPercent`% of the current value and the flat allowance. Returns
 * one human-readable violation per offending field.
 */
export function validatePercentCap(
  current: BumpAmounts,
  deltas: BumpAmounts,
  maxPercent: number,
  flatIncrease: BumpAmounts,
): string[] {
  const violations: string[] = []
  for (const field of Object.keys(deltas) as (keyof BumpAmounts)[]) {
    const delta = deltas[field]
    if (delta <= 0) continue
    const maxDelta = maxDeltaForPercentCap(current[field], maxPercent, flatIncrease[field])
    if (delta > maxDelta) {
      violations.push(
        `${FIELD_LABELS[field]} increase of ${delta} exceeds the per-bump limit ` +
          `(max +${maxDelta} on current ${current[field]}; greater of +${maxPercent}% or +${flatIncrease[field]})`,
      )
    }
  }
  return violations
}

/**
 * The requested delta plus what the editor has already handed out in the rolling
 * 24h window may not exceed their daily budget. Returns one violation per field.
 */
export function validateDailyBudget(spent: BumpAmounts, deltas: BumpAmounts, budget: BumpAmounts): string[] {
  const violations: string[] = []
  for (const field of Object.keys(deltas) as (keyof BumpAmounts)[]) {
    const delta = deltas[field]
    if (delta <= 0) continue
    if (spent[field] + delta > budget[field]) {
      const remaining = Math.max(0, budget[field] - spent[field])
      violations.push(
        `${FIELD_LABELS[field]} daily budget exceeded: ${delta} requested but only ${remaining} of ` +
          `${budget[field]} remains for the next 24h`,
      )
    }
  }
  return violations
}
