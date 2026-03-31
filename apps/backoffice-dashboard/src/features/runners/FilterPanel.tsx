/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { FilterDrawer } from '@backoffice/components/FilterDrawer'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Checkbox } from '@dashboard/ui/checkbox'
import { RunnerFiltersDto } from '../../types'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: RunnerFiltersDto
  onApply: (filters: RunnerFiltersDto) => void
  onReset: () => void
}

export const FilterPanel = ({ open, onClose, filters, onApply, onReset }: FilterPanelProps) => {
  const [localFilters, setLocalFilters] = useState<RunnerFiltersDto>(filters)

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
    <FilterDrawer open={open} onOpenChange={onClose} title="Filter Runners" onApply={handleApply} onReset={handleReset}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search">Domain or ID</Label>
          <Input
            id="search"
            placeholder="Search by domain or ID"
            value={localFilters.search || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
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

        <div className="flex items-center space-x-2">
          <Checkbox
            id="unschedulable"
            checked={localFilters.unschedulable || false}
            onCheckedChange={(checked) => setLocalFilters((prev) => ({ ...prev, unschedulable: checked as boolean }))}
          />
          <Label htmlFor="unschedulable" className="text-sm font-normal">
            Unschedulable Only
          </Label>
        </div>

        <div className="space-y-2">
          <Label>CPU Usage % Range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              max={100}
              value={localFilters.cpuUsage?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  cpuUsage: { ...prev.cpuUsage, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              max={100}
              value={localFilters.cpuUsage?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  cpuUsage: { ...prev.cpuUsage, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Memory Usage % Range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              max={100}
              value={localFilters.memoryUsage?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  memoryUsage: { ...prev.memoryUsage, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              max={100}
              value={localFilters.memoryUsage?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  memoryUsage: { ...prev.memoryUsage, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Disk Usage % Range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              max={100}
              value={localFilters.diskUsage?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  diskUsage: { ...prev.diskUsage, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              max={100}
              value={localFilters.diskUsage?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  diskUsage: { ...prev.diskUsage, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Availability Score Range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.availabilityScore?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  availabilityScore: {
                    ...prev.availabilityScore,
                    min: e.target.value ? Number(e.target.value) : undefined,
                  },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.availabilityScore?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  availabilityScore: {
                    ...prev.availabilityScore,
                    max: e.target.value ? Number(e.target.value) : undefined,
                  },
                }))
              }
            />
          </div>
        </div>
      </div>
    </FilterDrawer>
  )
}
