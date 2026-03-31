/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { FilterDrawer } from '@backoffice/components/FilterDrawer'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Checkbox } from '@dashboard/ui/checkbox'
import { OrganizationFiltersDto } from '../../types'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: OrganizationFiltersDto
  onApply: (filters: OrganizationFiltersDto) => void
  onReset: () => void
}

export const FilterPanel = ({ open, onClose, filters, onApply, onReset }: FilterPanelProps) => {
  const [localFilters, setLocalFilters] = useState<OrganizationFiltersDto>(filters)

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
      title="Filter Organizations"
      onApply={handleApply}
      onReset={handleReset}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by name or ID..."
            value={localFilters.search || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
          />
        </div>

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
          <Label htmlFor="createdBy">Created By</Label>
          <Input
            id="createdBy"
            placeholder="Filter by creator"
            value={localFilters.createdBy || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, createdBy: e.target.value || undefined }))}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="personal"
            checked={localFilters.personal || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, personal: checked as boolean }))}
          />
          <Label htmlFor="personal" className="text-sm font-normal">
            Personal Only
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="suspended"
            checked={localFilters.suspended || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, suspended: checked as boolean }))}
          />
          <Label htmlFor="suspended" className="text-sm font-normal">
            Suspended Only
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="telemetryEnabled"
            checked={localFilters.telemetryEnabled || false}
            onCheckedChange={(checked) =>
              setLocalFilters((prev) => ({ ...prev, telemetryEnabled: checked as boolean }))
            }
          />
          <Label htmlFor="telemetryEnabled" className="text-sm font-normal">
            Telemetry Enabled
          </Label>
        </div>
      </div>
    </FilterDrawer>
  )
}
