/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { FilterDrawer } from '@backoffice/components/FilterDrawer'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Checkbox } from '@dashboard/ui/checkbox'
import { SnapshotFiltersDto } from '../../types'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: SnapshotFiltersDto
  onApply: (filters: SnapshotFiltersDto) => void
  onReset: () => void
}

export const FilterPanel = ({ open, onClose, filters, onApply, onReset }: FilterPanelProps) => {
  const [localFilters, setLocalFilters] = useState<SnapshotFiltersDto>(filters)

  useEffect(() => {
    if (open) {
      setLocalFilters(filters)
    }
  }, [open, filters])

  const handleApply = () => {
    onApply(localFilters)
    onClose()
  }

  const handleReset = () => {
    setLocalFilters({})
    onReset()
    onClose()
  }

  return (
    <FilterDrawer
      open={open}
      onOpenChange={onClose}
      title="Filter Snapshots"
      onApply={handleApply}
      onReset={handleReset}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Search by name"
            value={localFilters.name || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, name: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="organizationId">Organization ID</Label>
          <Input
            id="organizationId"
            placeholder="Filter by organization"
            value={localFilters.organizationId || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, organizationId: e.target.value || undefined }))}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="general"
            checked={localFilters.general || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, general: checked as boolean }))}
          />
          <Label htmlFor="general" className="text-sm font-normal">
            General Only
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="hideFromUsers"
            checked={localFilters.hideFromUsers || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, hideFromUsers: checked as boolean }))}
          />
          <Label htmlFor="hideFromUsers" className="text-sm font-normal">
            Hidden From Users
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
          <Label>Size Range (GB)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.size?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  size: { ...prev.size, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.size?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  size: { ...prev.size, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>
      </div>
    </FilterDrawer>
  )
}
