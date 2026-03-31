/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { FilterDrawer } from '@backoffice/components/FilterDrawer'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Switch } from '@dashboard/ui/switch'
import { Checkbox } from '@dashboard/ui/checkbox'
import { Textarea } from '@dashboard/ui/textarea'
import { Separator } from '@dashboard/ui/separator'
import { SandboxFiltersDto, SandboxState } from '../../types'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: SandboxFiltersDto
  onApply: (filters: SandboxFiltersDto) => void
  onReset: () => void
}

// Helper function to parse sandbox IDs from textarea
const parseSandboxIds = (input: string): string[] => {
  if (!input || input.trim() === '') return []

  const rawIds = input.split(/[,\n]+/)

  return rawIds
    .map((id) => id.trim())
    .map((id) => id.replace(/^["']|["']$/g, ''))
    .filter((id) => id.length > 0)
}

// Helper function to convert sandboxIds array to string for textarea
const sandboxIdsToString = (ids?: string[]): string => {
  return ids && ids.length > 0 ? ids.join('\n') : ''
}

export const FilterPanel = ({ open, onClose, filters, onApply, onReset }: FilterPanelProps) => {
  const [localFilters, setLocalFilters] = useState<SandboxFiltersDto>(filters)
  const [sandboxIdsInput, setSandboxIdsInput] = useState('')

  useEffect(() => {
    if (open) {
      setLocalFilters(filters)
      setSandboxIdsInput(sandboxIdsToString(filters.sandboxIds))
    }
  }, [open, filters])

  const handleApply = () => {
    const parsedFilters = {
      ...localFilters,
      sandboxIds: sandboxIdsInput ? parseSandboxIds(sandboxIdsInput) : undefined,
    }
    onApply(parsedFilters)
    onClose()
  }

  const handleReset = () => {
    setLocalFilters({
      excludeStates: [SandboxState.DESTROYED],
    })
    setSandboxIdsInput('')
    onReset()
    onClose()
  }

  return (
    <FilterDrawer
      open={open}
      onOpenChange={onClose}
      title="Filter Sandboxes"
      onApply={handleApply}
      onReset={handleReset}
    >
      <div className="space-y-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          placeholder="Search by ID..."
          value={localFilters.search || ''}
          onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
        />
      </div>

      {/* Quick Toggle Filters */}
      <div className="space-y-4 rounded-md bg-muted p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base text-destructive">Errors Only</Label>
            <p className="text-xs text-muted-foreground">Show only sandboxes with errors</p>
          </div>
          <Switch
            checked={localFilters.errorOnly || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, errorOnly: checked }))}
          />
        </div>
      </div>

      {/* Sandbox ID/Name List */}
      <div className="space-y-2 rounded-md border border-dashed bg-muted/50 p-4">
        <Label className="text-base">Sandbox ID/Name List</Label>
        <p className="text-xs text-muted-foreground">
          Enter one or more sandbox ID or Name values (comma or newline separated, quotes optional)
        </p>
        <Textarea
          placeholder={'e.g.\nsandbox-123\nsandbox-456, sandbox-789\n"sandbox-abc"'}
          value={sandboxIdsInput}
          onChange={(e) => setSandboxIdsInput(e.target.value)}
          rows={4}
          className="font-mono text-xs"
        />
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="organizationId">Organization ID</Label>
          <Input
            id="organizationId"
            placeholder="Filter by organization"
            value={localFilters.organizationId || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, organizationId: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="region">Region</Label>
          <Select
            value={localFilters.region || ''}
            onValueChange={(value) => setLocalFilters((prev) => ({ ...prev, region: value || undefined }))}
          >
            <SelectTrigger id="region">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">US</SelectItem>
              <SelectItem value="eu">EU</SelectItem>
              <SelectItem value="asia">Asia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="runnerId">Runner ID</Label>
          <Input
            id="runnerId"
            placeholder="Filter by runner"
            value={localFilters.runnerId || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, runnerId: e.target.value || undefined }))}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="public"
            checked={localFilters.public || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, public: checked as boolean }))}
          />
          <Label htmlFor="public" className="text-sm font-normal">
            Public Only
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasError"
            checked={localFilters.hasError || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, hasError: checked as boolean }))}
          />
          <Label htmlFor="hasError" className="text-sm font-normal">
            Has Error
          </Label>
        </div>

        <div className="space-y-2">
          <Label>CPU Range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.cpu?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  cpu: { ...prev.cpu, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.cpu?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  cpu: { ...prev.cpu, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Memory Range (GB)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.memory?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  memory: { ...prev.memory, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.memory?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  memory: { ...prev.memory, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Disk Range (GB)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.disk?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  disk: { ...prev.disk, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.disk?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  disk: { ...prev.disk, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>
      </div>
    </FilterDrawer>
  )
}
