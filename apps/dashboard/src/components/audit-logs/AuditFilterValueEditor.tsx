/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandCheckboxItem,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { FacetedFilterIcon, type FacetedFilterOption } from '@/components/ui/faceted-filter'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Plus, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { isListOperator, type AuditFilterFieldDef } from './auditLogFilterConfig'

function OptionContent({ label, description }: { label: ReactNode; description?: ReactNode }) {
  if (description === undefined) {
    return <>{label}</>
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="truncate">{label}</span>
      <code className="ml-auto shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-xs text-muted-foreground">
        {description}
      </code>
    </span>
  )
}

interface AuditFilterValueEditorProps {
  def: AuditFilterFieldDef
  operator: string
  value: string[]
  onChange: (value: string[]) => void
  options?: readonly FacetedFilterOption[]
  onClose?: () => void
}

export function AuditFilterValueEditor({
  def,
  operator,
  value,
  onChange,
  options,
  onClose,
}: AuditFilterValueEditorProps) {
  const isMulti = isListOperator(operator)

  if (def.type === 'enum') {
    return (
      <EnumEditor
        def={def}
        isMulti={isMulti}
        value={value}
        onChange={onChange}
        options={options ?? def.options ?? []}
        onClose={onClose}
      />
    )
  }

  if (isMulti) {
    return <TokenEditor def={def} value={value} onChange={onChange} />
  }

  return <SingleValueEditor def={def} value={value} onChange={onChange} onClose={onClose} />
}

function EnumEditor({
  def,
  isMulti,
  value,
  onChange,
  options,
  onClose,
}: {
  def: AuditFilterFieldDef
  isMulti: boolean
  value: string[]
  onChange: (value: string[]) => void
  options: readonly FacetedFilterOption[]
  onClose?: () => void
}) {
  const [search, setSearch] = useState('')
  const selected = new Set(value)
  const trimmedSearch = search.trim()
  const hasExactOption = options.some((option) => option.value === trimmedSearch)
  const canAddCustom = Boolean(def.allowCustom) && trimmedSearch.length > 0 && !hasExactOption

  const toggle = (optionValue: string) => {
    if (isMulti) {
      const next = new Set(selected)
      if (next.has(optionValue)) {
        next.delete(optionValue)
      } else {
        next.add(optionValue)
      }
      onChange(Array.from(next))
    } else {
      onChange([optionValue])
      onClose?.()
    }
  }

  const addCustom = () => {
    if (!canAddCustom) {
      return
    }
    if (isMulti) {
      if (!selected.has(trimmedSearch)) {
        onChange([...value, trimmedSearch])
      }
      setSearch('')
    } else {
      onChange([trimmedSearch])
      onClose?.()
    }
  }

  return (
    <Command shouldFilter>
      <CommandInput placeholder={def.placeholder ?? def.label} value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>{canAddCustom ? null : 'No results found.'}</CommandEmpty>
        {canAddCustom && (
          <CommandGroup>
            <CommandItem value={`__add__${trimmedSearch}`} onSelect={addCustom}>
              <Plus className="size-4" />
              Add &ldquo;{trimmedSearch}&rdquo;
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup>
          {options.map((option) =>
            isMulti ? (
              <CommandCheckboxItem
                key={option.value}
                checked={selected.has(option.value)}
                onSelect={() => toggle(option.value)}
              >
                {option.icon && <FacetedFilterIcon className="mr-2">{option.icon}</FacetedFilterIcon>}
                <OptionContent label={option.label} description={option.description} />
              </CommandCheckboxItem>
            ) : (
              <CommandItem key={option.value} value={option.value} onSelect={() => toggle(option.value)}>
                {option.icon && <FacetedFilterIcon className="mr-2">{option.icon}</FacetedFilterIcon>}
                <OptionContent label={option.label} description={option.description} />
                {selected.has(option.value) && <span className="ml-auto text-xs text-muted-foreground">selected</span>}
              </CommandItem>
            ),
          )}
          {isMulti &&
            value
              .filter((entry) => !options.some((option) => option.value === entry))
              .map((entry) => (
                <CommandCheckboxItem key={entry} checked onSelect={() => toggle(entry)}>
                  {entry}
                </CommandCheckboxItem>
              ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

function SingleValueEditor({
  def,
  value,
  onChange,
  onClose,
}: {
  def: AuditFilterFieldDef
  value: string[]
  onChange: (value: string[]) => void
  onClose?: () => void
}) {
  const [draft, setDraft] = useState(value[0] ?? '')

  const commit = () => {
    const trimmed = draft.trim()
    onChange(trimmed.length > 0 ? [trimmed] : [])
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <Input
        autoFocus
        type={def.type === 'number' ? 'number' : 'text'}
        inputMode={def.type === 'number' ? 'numeric' : undefined}
        placeholder={def.placeholder ?? def.label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            onClose?.()
          }
        }}
        className="h-8"
      />
    </div>
  )
}

function TokenEditor({
  def,
  value,
  onChange,
}: {
  def: AuditFilterFieldDef
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const addTokens = () => {
    const seen = new Set(value)
    const tokens: string[] = []
    for (const raw of draft.split(',')) {
      const token = raw.trim()
      if (token.length > 0 && !seen.has(token)) {
        seen.add(token)
        tokens.push(token)
      }
    }
    if (tokens.length > 0) {
      onChange([...value, ...tokens])
    }
    setDraft('')
  }

  const removeToken = (token: string) => {
    onChange(value.filter((entry) => entry !== token))
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {value.length > 0 && (
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {value.map((token) => (
            <span
              key={token}
              className="inline-flex max-w-full items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs"
            >
              <span className="truncate">{token}</span>
              <button
                type="button"
                aria-label={`Remove ${token}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeToken(token)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          placeholder={def.placeholder ?? def.label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              addTokens()
            }
          }}
          className="h-8"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={cn('shrink-0', { 'opacity-50': draft.trim().length === 0 })}
          disabled={draft.trim().length === 0}
          onClick={addTokens}
          aria-label="Add value"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}
