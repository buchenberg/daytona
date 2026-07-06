/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ResponsiveButton } from '@/components/ResponsiveButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FacetedFilterOption } from '@/components/ui/faceted-filter'
import { ListFilter } from 'lucide-react'
import { AuditFilterValueEditor } from './AuditFilterValueEditor'
import { AUDIT_FILTER_FIELDS, type AuditFilterRule } from './auditLogFilterConfig'

interface AuditLogFilterMenuProps {
  rules: AuditFilterRule[]
  onRulesChange: (rules: AuditFilterRule[]) => void
  optionsByField?: Record<string, readonly FacetedFilterOption[]>
  disabled?: boolean
}

export function AuditLogFilterMenu({
  rules,
  onRulesChange,
  optionsByField,
  disabled = false,
}: AuditLogFilterMenuProps) {
  const upsertValue = (field: string, value: string[]) => {
    const def = AUDIT_FILTER_FIELDS.find((entry) => entry.field === field)
    if (!def) {
      return
    }

    const existingIndex = rules.findIndex((rule) => rule.field === field)

    if (value.length === 0) {
      if (existingIndex >= 0) {
        onRulesChange(rules.filter((_, index) => index !== existingIndex))
      }
      return
    }

    if (existingIndex >= 0) {
      onRulesChange(rules.map((rule, index) => (index === existingIndex ? { ...rule, value } : rule)))
    } else {
      onRulesChange([...rules, { field, operator: def.defaultOperator, value }])
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <ResponsiveButton
            icon={<ListFilter className="size-4" />}
            variant="outline"
            className="shrink-0 bg-transparent hover:bg-accent dark:bg-input/50 dark:hover:bg-accent"
            disabled={disabled}
          >
            Filter
          </ResponsiveButton>
        }
      />
      <DropdownMenuContent className="w-52" align="start">
        {AUDIT_FILTER_FIELDS.map((def) => {
          const Icon = def.icon
          const rule = rules.find((entry) => entry.field === def.field)

          return (
            <DropdownMenuSub key={def.field}>
              <DropdownMenuSubTrigger>
                <Icon className="size-4" />
                {def.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-64 p-0">
                  <AuditFilterValueEditor
                    def={def}
                    operator={rule?.operator ?? def.defaultOperator}
                    value={rule?.value ?? []}
                    options={optionsByField?.[def.field]}
                    onChange={(value) => upsertValue(def.field, value)}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
