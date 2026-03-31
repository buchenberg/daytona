/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { FilterDrawer } from '@backoffice/components/FilterDrawer'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { OrganizationUserFiltersDto, OrganizationMemberRole } from '../../types'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: OrganizationUserFiltersDto
  onApply: (filters: OrganizationUserFiltersDto) => void
  onReset: () => void
}

export const FilterPanel = ({ open, onClose, filters, onApply, onReset }: FilterPanelProps) => {
  const [localFilters, setLocalFilters] = useState<OrganizationUserFiltersDto>(filters)

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
      title="Filter Organization Users"
      onApply={handleApply}
      onReset={handleReset}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by user ID or org ID..."
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
          <Label htmlFor="userId">User ID</Label>
          <Input
            id="userId"
            placeholder="Filter by user ID"
            value={localFilters.userId || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, userId: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select
            value={Array.isArray(localFilters.role) && localFilters.role.length > 0 ? localFilters.role[0] : ''}
            onValueChange={(value) =>
              setLocalFilters((prev) => ({
                ...prev,
                role: value ? [value as OrganizationMemberRole] : undefined,
              }))
            }
          >
            <SelectTrigger id="role">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OrganizationMemberRole.OWNER}>OWNER</SelectItem>
              <SelectItem value={OrganizationMemberRole.MEMBER}>MEMBER</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </FilterDrawer>
  )
}
