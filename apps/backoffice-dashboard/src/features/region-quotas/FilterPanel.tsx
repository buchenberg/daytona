/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { FilterDrawer } from '@backoffice/components/FilterDrawer'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { RegionQuotaFiltersDto } from '../../types'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: RegionQuotaFiltersDto
  onApply: (filters: RegionQuotaFiltersDto) => void
  onReset: () => void
}

export const FilterPanel = ({ open, onClose, filters, onApply, onReset }: FilterPanelProps) => {
  const [localFilters, setLocalFilters] = useState<RegionQuotaFiltersDto>(filters)

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
      title="Filter Region Quotas"
      onApply={handleApply}
      onReset={handleReset}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by org name or ID..."
            value={localFilters.search || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="organizationId">Organization ID</Label>
          <Input
            id="organizationId"
            placeholder="Filter by organization ID"
            value={localFilters.organizationId || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, organizationId: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="organizationName">Organization Name</Label>
          <Input
            id="organizationName"
            placeholder="Search by organization name"
            value={localFilters.organizationName || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, organizationName: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="regionId">Region ID</Label>
          <Input
            id="regionId"
            placeholder="Filter by region"
            value={localFilters.regionId || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, regionId: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label>CPU Quota Range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.cpuQuota?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  cpuQuota: { ...prev.cpuQuota, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.cpuQuota?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  cpuQuota: { ...prev.cpuQuota, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Memory Quota Range (GB)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.memoryQuota?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  memoryQuota: { ...prev.memoryQuota, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.memoryQuota?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  memoryQuota: { ...prev.memoryQuota, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Disk Quota Range (GB)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              min={0}
              value={localFilters.diskQuota?.min || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  diskQuota: { ...prev.diskQuota, min: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max"
              min={0}
              value={localFilters.diskQuota?.max || ''}
              onChange={(e) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  diskQuota: { ...prev.diskQuota, max: e.target.value ? Number(e.target.value) : undefined },
                }))
              }
            />
          </div>
        </div>
      </div>
    </FilterDrawer>
  )
}
