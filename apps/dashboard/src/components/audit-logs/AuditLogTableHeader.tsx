/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DataTableConfigMenu } from '@/components/DataTableConfigMenu'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type QuickRangesConfig } from '@/components/ui/date-range-picker'
import type { FacetedFilterOption } from '@/components/ui/faceted-filter'
import { AuditLog } from '@daytona/api-client'
import { type Table } from '@tanstack/react-table'
import { type ReactNode, useMemo } from 'react'
import { DateRange } from 'react-day-picker'
import { AuditLogFilterChip } from './AuditLogFilterChip'
import { AuditLogFilterMenu } from './AuditLogFilterMenu'
import { type AuditFilterRule } from './auditLogFilterConfig'
import { useApiKeyFilterOptions } from './useApiKeyFilterOptions'

const AUDIT_LOG_QUICK_RANGES: QuickRangesConfig = {
  minutes: [5, 15, 30],
  hours: [1, 3, 6, 12],
  days: [1, 2, 7, 30, 90],
  months: [6],
  years: [1],
}

const AUDIT_LOG_COLUMN_LABELS: Record<string, string> = {
  time: 'Time',
  user: 'User',
  action: 'Action',
  target: 'Target',
  outcome: 'Outcome',
}

interface AuditLogTableHeaderProps {
  table: Table<AuditLog>
  rules: AuditFilterRule[]
  onRulesChange: (rules: AuditFilterRule[]) => void
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  onClearFilters?: () => void
  disabled?: boolean
  refreshControl?: ReactNode
}

export function AuditLogTableHeader({
  table,
  rules,
  onRulesChange,
  dateRange,
  onDateRangeChange,
  onClearFilters,
  disabled = false,
  refreshControl,
}: AuditLogTableHeaderProps) {
  const apiKeyOptions = useApiKeyFilterOptions()
  const optionsByField = useMemo<Record<string, readonly FacetedFilterOption[]>>(
    () => ({ actorApiKeySuffix: apiKeyOptions }),
    [apiKeyOptions],
  )

  const updateRule = (index: number, rule: AuditFilterRule) => {
    onRulesChange(rules.map((entry, entryIndex) => (entryIndex === index ? rule : entry)))
  }

  const removeRule = (index: number) => {
    onRulesChange(rules.filter((_, entryIndex) => entryIndex !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <DateRangePicker
            className="min-w-0 shrink max-w-95"
            value={dateRange}
            onChange={onDateRangeChange}
            quickRangesEnabled
            quickRanges={AUDIT_LOG_QUICK_RANGES}
            timeSelection
            disabled={disabled}
          />
          <AuditLogFilterMenu
            rules={rules}
            onRulesChange={onRulesChange}
            optionsByField={optionsByField}
            disabled={disabled}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          {refreshControl}
          <DataTableConfigMenu
            table={table}
            persistenceKey="audit-logs"
            getColumnLabel={(columnId) => AUDIT_LOG_COLUMN_LABELS[columnId] ?? columnId}
          />
        </div>
      </div>

      {rules.length > 0 ? (
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {rules.map((rule, index) => (
              <AuditLogFilterChip
                key={`${index}-${rule.field}-${rule.operator}`}
                rule={rule}
                options={optionsByField[rule.field]}
                onChange={(next) => updateRule(index, next)}
                onRemove={() => removeRule(index)}
              />
            ))}
          </div>
          {onClearFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-3 text-muted-foreground hover:text-foreground"
              onClick={onClearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
