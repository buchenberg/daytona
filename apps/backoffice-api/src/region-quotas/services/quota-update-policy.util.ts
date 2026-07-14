/**
 * Pure policy checks for temporary region-quota updates. Kept side-effect free so
 * they are trivially unit-testable; the service turns any returned violation
 * strings into a ForbiddenException.
 */

export interface QuotaAmounts {
  cpu: number
  memory: number
  disk: number
  gpu: number
}

const FIELD_LABELS: Record<keyof QuotaAmounts, string> = {
  cpu: 'CPU',
  memory: 'Memory (GiB)',
  disk: 'Disk (GiB)',
  gpu: 'GPU',
}

/**
 * Largest delta allowed for a single field per update: `maxPercent`% of the
 * current value, floored. Purely relative — a field at 0 cannot be increased
 * by an update request. The per-editor daily budget (checked separately) is
 * the overall upper bound.
 */
export function maxDeltaForPercentCap(current: number, maxPercent: number): number {
  return Math.floor((current * maxPercent) / 100)
}

/**
 * Each requested delta may not exceed `maxPercent`% of the field's current
 * value. Returns one human-readable violation per offending field.
 */
export function validatePercentCap(current: QuotaAmounts, deltas: QuotaAmounts, maxPercent: number): string[] {
  const violations: string[] = []
  for (const field of Object.keys(deltas) as (keyof QuotaAmounts)[]) {
    const delta = deltas[field]
    if (delta <= 0) continue
    const maxDelta = maxDeltaForPercentCap(current[field], maxPercent)
    if (delta > maxDelta) {
      violations.push(
        `${FIELD_LABELS[field]} increase of ${delta} exceeds the per-update limit ` +
          `(max +${maxDelta} = ${maxPercent}% of current ${current[field]})`,
      )
    }
  }
  return violations
}

/**
 * The requested delta plus what the editor has already handed out in the rolling
 * 24h window may not exceed their daily budget. Returns one violation per field.
 */
export function validateDailyBudget(spent: QuotaAmounts, deltas: QuotaAmounts, budget: QuotaAmounts): string[] {
  const violations: string[] = []
  for (const field of Object.keys(deltas) as (keyof QuotaAmounts)[]) {
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
