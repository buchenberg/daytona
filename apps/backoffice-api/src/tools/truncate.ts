/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

const MAX_RESULT_LENGTH = 80_000

export function truncateResult(data: unknown): string {
  const serialized = JSON.stringify(data, null, 2)
  if (serialized.length <= MAX_RESULT_LENGTH) return serialized

  if (Array.isArray(data)) {
    return truncateArray(data)
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    // Handle Prometheus/Loki nested structure
    if (obj.data && typeof obj.data === 'object' && 'result' in (obj.data as Record<string, unknown>)) {
      const inner = (obj.data as Record<string, unknown>).result
      if (Array.isArray(inner)) {
        return truncateNestedArray(obj, ['data', 'result'])
      }
    }
    // Handle OpenSearch hits structure
    if (obj.hits && typeof obj.hits === 'object' && 'hits' in (obj.hits as Record<string, unknown>)) {
      const inner = (obj.hits as Record<string, unknown>).hits
      if (Array.isArray(inner)) {
        return truncateNestedArray(obj, ['hits', 'hits'])
      }
    }
  }

  return serialized.substring(0, MAX_RESULT_LENGTH) + '\n...[TRUNCATED]'
}

function truncateArray(arr: unknown[]): string {
  let items = arr
  while (items.length > 1) {
    const attempt = JSON.stringify(items, null, 2)
    if (attempt.length <= MAX_RESULT_LENGTH) {
      const note = items.length < arr.length ? `\n[Showing ${items.length} of ${arr.length} results]` : ''
      return attempt + note
    }
    items = items.slice(0, Math.ceil(items.length / 2))
  }
  const single = JSON.stringify(items, null, 2)
  if (single.length <= MAX_RESULT_LENGTH) return single + `\n[Showing 1 of ${arr.length} results]`
  return single.substring(0, MAX_RESULT_LENGTH) + '\n...[TRUNCATED]'
}

function truncateNestedArray(obj: Record<string, unknown>, path: string[]): string {
  const getArray = (): unknown[] => {
    let current: unknown = obj
    for (const key of path) {
      current = (current as Record<string, unknown>)[key]
    }
    return current as unknown[]
  }

  const setArray = (arr: unknown[]): Record<string, unknown> => {
    const clone = JSON.parse(JSON.stringify(obj))
    let current: Record<string, unknown> = clone
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]] as Record<string, unknown>
    }
    current[path[path.length - 1]] = arr
    return clone
  }

  const original = getArray()
  let items = original
  while (items.length > 1) {
    const modified = setArray(items)
    const attempt = JSON.stringify(modified, null, 2)
    if (attempt.length <= MAX_RESULT_LENGTH) {
      if (items.length < original.length) {
        ;(modified as Record<string, unknown>)._truncated = `Showing ${items.length} of ${original.length} results`
      }
      return JSON.stringify(modified, null, 2)
    }
    items = items.slice(0, Math.ceil(items.length / 2))
  }

  const modified = setArray(items)
  const serialized = JSON.stringify(modified, null, 2)
  if (serialized.length <= MAX_RESULT_LENGTH) return serialized
  return serialized.substring(0, MAX_RESULT_LENGTH) + '\n...[TRUNCATED]'
}

export function safeSummary(obj: unknown, maxLen = 200): Record<string, unknown> {
  try {
    const s = JSON.stringify(obj)
    if (s.length <= maxLen) return obj as Record<string, unknown>
    return { _summary: s.substring(0, maxLen) + '...' }
  } catch {
    return { _summary: String(obj).substring(0, maxLen) }
  }
}
