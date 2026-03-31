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
import { Separator } from '@dashboard/ui/separator'
import type { UserFiltersDto } from '@daytonaio/backoffice-api-client'

interface UserFiltersPanelProps {
  open: boolean
  onClose: () => void
  filters: UserFiltersDto
  onApply: (filters: UserFiltersDto) => void
  onReset: () => void
  hideDeleted: boolean
  onHideDeletedChange: (hide: boolean) => void
}

export const UserFiltersPanel = ({
  open,
  onClose,
  filters,
  onApply,
  onReset,
  hideDeleted,
  onHideDeletedChange,
}: UserFiltersPanelProps) => {
  const [localFilters, setLocalFilters] = useState<UserFiltersDto>(filters)

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
    <FilterDrawer open={open} onOpenChange={onClose} title="Filter Users" onApply={handleApply} onReset={handleReset}>
      <div className="space-y-4 rounded-md bg-muted p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Hide Deleted Users</Label>
            <p className="text-xs text-muted-foreground">Exclude users that have been deleted</p>
          </div>
          <Switch checked={hideDeleted} onCheckedChange={onHideDeletedChange} />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by email or ID..."
            value={localFilters.search || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            placeholder="Filter by email..."
            value={localFilters.email || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, email: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Filter by name..."
            value={localFilters.name || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, name: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="userId">User ID</Label>
          <Input
            id="userId"
            placeholder="Exact user ID..."
            value={localFilters.userId || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, userId: e.target.value || undefined }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="emailVerified">Email Verified</Label>
          <Select
            value={localFilters.emailVerified === undefined ? 'all' : localFilters.emailVerified ? 'true' : 'false'}
            onValueChange={(value) =>
              setLocalFilters((prev) => ({
                ...prev,
                emailVerified: value === 'all' ? undefined : value === 'true',
              }))
            }
          >
            <SelectTrigger id="emailVerified">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">Verified</SelectItem>
              <SelectItem value="false">Unverified</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="createdAfter">Created After</Label>
          <Input
            id="createdAfter"
            type="date"
            value={localFilters.createdAfter ? localFilters.createdAfter.substring(0, 10) : ''}
            onChange={(e) =>
              setLocalFilters((prev) => ({ ...prev, createdAfter: e.target.value ? e.target.value : undefined }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="createdBefore">Created Before</Label>
          <Input
            id="createdBefore"
            type="date"
            value={localFilters.createdBefore ? localFilters.createdBefore.substring(0, 10) : ''}
            onChange={(e) =>
              setLocalFilters((prev) => ({ ...prev, createdBefore: e.target.value ? e.target.value : undefined }))
            }
          />
        </div>
      </div>
    </FilterDrawer>
  )
}
