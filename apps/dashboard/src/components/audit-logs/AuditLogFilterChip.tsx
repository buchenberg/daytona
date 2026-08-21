import {
  FacetedFilterAnchor,
  FacetedFilterClear,
  FacetedFilterContent,
  FacetedFilterLabelTrigger,
  FacetedFilterOperator,
  FacetedFilterRoot,
  FacetedFilterValues,
  FacetedFilterValueSummary,
  FacetedFilterValueTrigger,
} from '@/components/ui/faceted-filter'
import type { FacetedFilterOption } from '@/components/ui/faceted-filter'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { AuditFilterValueEditor } from './AuditFilterValueEditor'
import {
  getAuditFilterFieldDef,
  getAuditValueLabel,
  isListOperator,
  type AuditFilterRule,
} from './auditLogFilterConfig'

interface AuditLogFilterChipProps {
  rule: AuditFilterRule
  onChange: (rule: AuditFilterRule) => void
  onRemove: () => void
  options?: readonly FacetedFilterOption[]
  defaultOpen?: boolean
}

export function AuditLogFilterChip({
  rule,
  onChange,
  onRemove,
  options,
  defaultOpen = false,
}: AuditLogFilterChipProps) {
  const def = getAuditFilterFieldDef(rule.field)
  const [open, setOpen] = useState(defaultOpen)
  const latestValueRef = useRef(rule.value)
  useEffect(() => {
    latestValueRef.current = rule.value
  }, [rule.value])

  if (!def) {
    return null
  }

  const valueItems = rule.value.map((entry) => ({ value: entry, label: getAuditValueLabel(def, entry, options) }))
  const Icon = def.icon

  const handleOperatorChange = (operator: string) => {
    const value = !isListOperator(operator) && rule.value.length > 1 ? rule.value.slice(0, 1) : rule.value
    onChange({ ...rule, operator, value })
  }

  const handleValueChange = (value: string[]) => {
    latestValueRef.current = value
    onChange({ ...rule, value })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen && latestValueRef.current.length === 0) {
      onRemove()
    }
  }

  return (
    <FacetedFilterRoot title={def.label} hasValue onClear={onRemove} open={open} onOpenChange={handleOpenChange}>
      <FacetedFilterAnchor>
        <FacetedFilterLabelTrigger icon={<Icon />} aria-label={`Filter by ${def.label}`}>
          {def.label}
        </FacetedFilterLabelTrigger>
        <FacetedFilterOperator
          operator={rule.operator}
          operators={def.operators}
          onOperatorChange={handleOperatorChange}
        />
        <FacetedFilterValueTrigger
          className={cn({
            'px-1': valueItems.length <= 2,
            'px-2': valueItems.length > 2,
          })}
          aria-label={`Edit ${def.label} filter`}
        >
          {valueItems.length > 0 ? (
            <FacetedFilterValues title={def.label} items={valueItems} maxValues={2} />
          ) : (
            <FacetedFilterValueSummary key="placeholder" className="px-2 text-muted-foreground">
              Select value
            </FacetedFilterValueSummary>
          )}
        </FacetedFilterValueTrigger>
        <FacetedFilterClear aria-label={`Remove ${def.label} filter`} />
      </FacetedFilterAnchor>
      <FacetedFilterContent className="w-70">
        <AuditFilterValueEditor
          def={def}
          operator={rule.operator}
          value={rule.value}
          options={options}
          onChange={handleValueChange}
          onClose={() => handleOpenChange(false)}
        />
      </FacetedFilterContent>
    </FacetedFilterRoot>
  )
}
