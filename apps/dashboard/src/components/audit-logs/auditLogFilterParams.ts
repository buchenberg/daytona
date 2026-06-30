/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createParser } from 'nuqs'
import { type AuditFilterRule, getAuditFilterFieldDef, isListOperator } from './auditLogFilterConfig'

const RULE_SEPARATOR = ';'
const PART_SEPARATOR = ':'
const VALUE_SEPARATOR = ','

function serializeRules(rules: AuditFilterRule[]): string {
  return rules
    .map((rule) => {
      const value = rule.value.map((entry) => encodeURIComponent(entry)).join(VALUE_SEPARATOR)
      return [rule.field, rule.operator, value].join(PART_SEPARATOR)
    })
    .join(RULE_SEPARATOR)
}

function parseRules(query: string): AuditFilterRule[] {
  return query
    .split(RULE_SEPARATOR)
    .map((chunk): AuditFilterRule | null => {
      const firstSep = chunk.indexOf(PART_SEPARATOR)
      const secondSep = chunk.indexOf(PART_SEPARATOR, firstSep + 1)
      if (firstSep === -1 || secondSep === -1) {
        return null
      }

      const field = chunk.slice(0, firstSep)
      const operator = chunk.slice(firstSep + 1, secondSep)
      const rawValue = chunk.slice(secondSep + 1)

      const def = getAuditFilterFieldDef(field)
      if (!def || !def.operators.some((op) => op.value === operator)) {
        return null
      }

      const value = rawValue
        ? rawValue
            .split(VALUE_SEPARATOR)
            .map((entry) => {
              try {
                return decodeURIComponent(entry)
              } catch {
                return entry
              }
            })
            .filter((entry) => entry.length > 0)
        : []

      const normalizedValue = !isListOperator(operator) && value.length > 1 ? value.slice(0, 1) : value

      return { field, operator, value: normalizedValue }
    })
    .filter((rule): rule is AuditFilterRule => rule !== null)
}

export const parseAsAuditFilters = createParser<AuditFilterRule[]>({
  parse: parseRules,
  serialize: serializeRules,
  eq: (a, b) => serializeRules(a) === serializeRules(b),
}).withDefault([])

export function buildAuditLogFilterParams(rules: AuditFilterRule[]): Record<string, string> {
  const params: Record<string, string> = {}

  for (const rule of rules) {
    const def = getAuditFilterFieldDef(rule.field)
    if (!def) {
      continue
    }

    const values = rule.value.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    if (values.length === 0) {
      continue
    }

    const key = `${rule.field}[${rule.operator}]`
    params[key] = isListOperator(rule.operator) ? values.join(VALUE_SEPARATOR) : values[0]
  }

  return params
}
