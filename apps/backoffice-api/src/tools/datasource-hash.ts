import { createHash } from 'crypto'

/**
 * Stable hash of a datasource's effective config. Used as the cache key for
 * each tool service's client pool, so N users with identical configs share
 * one client (one TypeORM pool, one axios instance) instead of N.
 *
 * Disabled configs all collapse to one shared sentinel bucket — no need to
 * allocate a hash per disabled user.
 *
 * Hashes live in memory only and contain derived (sha256) data from plaintext
 * secrets, which is fine: one-way and never persisted.
 */

export const DISABLED_HASH = '__disabled__'

export function hashConfig(cfg: { disabled: boolean } & Record<string, unknown>): string {
  if (cfg.disabled) return DISABLED_HASH
  return createHash('sha256').update(stableStringify(cfg)).digest('hex')
}

/**
 * Deterministic JSON stringify — keys sorted at every nesting level so that
 * `{host:'x', port:1}` and `{port:1, host:'x'}` produce the same output.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}
