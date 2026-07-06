/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DataTableConfigMenu } from '@/components/DataTableConfigMenu'
import { useAvailableSandboxClassesForOrganization } from '@/hooks/useAvailableSandboxClasses'
import { cn } from '@/lib/utils'
import {
  Boxes,
  Calendar,
  CalendarPlus,
  Camera,
  Cpu,
  Eye,
  Globe,
  HardDrive,
  ListFilter,
  MemoryStick,
  RefreshCw,
  Square,
  Tag,
  Wrench,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SearchInput } from '../SearchInput'
import TooltipButton from '../TooltipButton'
import { ResponsiveButton } from '../ResponsiveButton'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { BooleanFilter, BooleanFilterIndicator } from './filters/BooleanFilter'
import { CreatedAtFilter, CreatedAtFilterIndicator } from './filters/CreatedAtFilter'
import { LabelFilter, LabelFilterIndicator } from './filters/LabelFilter'
import { LastEventFilter, LastEventFilterIndicator } from './filters/LastEventFilter'
import { RegionFilter, RegionFilterIndicator } from './filters/RegionFilter'
import { ResourceFilter, ResourceFilterIndicator, ResourceFilterValue } from './filters/ResourceFilter'
import { SandboxClassFilter, SandboxClassFilterIndicator } from './filters/SandboxClassFilter'
import { SnapshotFilter, SnapshotFilterIndicator } from './filters/SnapshotFilter'
import { StateFilter, StateFilterIndicator } from './filters/StateFilter'
import { SandboxTableHeaderProps } from './types'

const RESOURCE_FILTERS = [
  { type: 'cpu' as const, label: 'CPU', icon: Cpu },
  { type: 'memory' as const, label: 'Memory', icon: MemoryStick },
  { type: 'disk' as const, label: 'Disk', icon: HardDrive },
]

const VISIBILITY_FILTER_LABELS = {
  true: 'Public',
  false: 'Private',
}

const RECOVERY_FILTER_LABELS = {
  true: 'Recoverable',
  false: 'Not recoverable',
}

const SANDBOX_TABLE_COLUMN_LABELS: Record<string, string> = {
  actions: 'Actions',
  select: 'Selection',
  name: 'Name',
  id: 'UUID',
  state: 'State',
  sandboxClass: 'Class',
  snapshot: 'Snapshot',
  region: 'Region',
  resources: 'Resources',
  labels: 'Labels',
  lastEvent: 'Last Event',
  createdAt: 'Created At',
}

const SANDBOX_TABLE_CONFIG_EXCLUDED_COLUMN_IDS = ['actions', 'select', 'isPublic', 'isRecoverable'] as const

type SandboxFacetFilterId =
  | 'state'
  | 'class'
  | 'snapshot'
  | 'region'
  | 'cpu'
  | 'memory'
  | 'disk'
  | 'labels'
  | 'lastEvent'
  | 'createdAt'
  | 'visibility'
  | 'recovery'

type SandboxFacetFilter = {
  id: SandboxFacetFilterId
  active: boolean
  filter: ReactNode
}

export function SandboxTableHeader({
  table,
  regionOptions,
  regionsDataIsLoading,
  snapshots,
  snapshotsDataIsLoading,
  snapshotsDataHasMore,
  onChangeSnapshotSearchValue,
  onRefresh,
  isRefreshing = false,
}: SandboxTableHeaderProps) {
  const availableSandboxClasses = useAvailableSandboxClassesForOrganization()
  const [facetFilterOrder, setFacetFilterOrder] = useState<SandboxFacetFilterId[]>([])
  const sandboxClassColumn = table.getColumn('sandboxClass')
  const showClassFilter = availableSandboxClasses.length > 1 && Boolean(sandboxClassColumn)
  const hasStateFilter = ((table.getColumn('state')?.getFilterValue() as string[]) || []).length > 0
  const hasClassFilter = ((sandboxClassColumn?.getFilterValue() as string[]) || []).length > 0
  const hasSnapshotFilter = ((table.getColumn('snapshot')?.getFilterValue() as string[]) || []).length > 0
  const hasRegionFilter = ((table.getColumn('region')?.getFilterValue() as string[]) || []).length > 0
  const hasLabelsFilter = ((table.getColumn('labels')?.getFilterValue() as string[]) || []).length > 0
  const hasLastEventFilter = ((table.getColumn('lastEvent')?.getFilterValue() as Date[]) || []).length > 0
  const hasCreatedAtFilter = ((table.getColumn('createdAt')?.getFilterValue() as Date[]) || []).length > 0
  const hasIsPublicFilter = table.getColumn('isPublic')?.getFilterValue() !== undefined
  const hasIsRecoverableFilter = table.getColumn('isRecoverable')?.getFilterValue() !== undefined
  const resourceFilterValue = (table.getColumn('resources')?.getFilterValue() as ResourceFilterValue | undefined) ?? {}
  const hasResourceFilter = RESOURCE_FILTERS.some(({ type }) => Boolean(resourceFilterValue[type]))

  const hasActiveFilters =
    hasStateFilter ||
    hasClassFilter ||
    hasSnapshotFilter ||
    hasRegionFilter ||
    hasLabelsFilter ||
    hasLastEventFilter ||
    hasCreatedAtFilter ||
    hasIsPublicFilter ||
    hasIsRecoverableFilter ||
    hasResourceFilter

  const pushFilter = (filterId: SandboxFacetFilterId) => {
    setFacetFilterOrder((order) => (order.includes(filterId) ? order : [...order, filterId]))
  }

  const handleClearFilters = () => {
    table.setColumnFilters((filters) => filters.filter((filter) => filter.id === 'name'))
    setFacetFilterOrder([])
  }

  const facetFilters: SandboxFacetFilter[] = [
    {
      id: 'state',
      active: hasStateFilter,
      filter: (
        <StateFilterIndicator
          key="state"
          value={(table.getColumn('state')?.getFilterValue() as string[]) || []}
          onFilterChange={(value) => {
            table.getColumn('state')?.setFilterValue(value)
            pushFilter('state')
          }}
        />
      ),
    },
    {
      id: 'snapshot',
      active: hasSnapshotFilter,
      filter: (
        <SnapshotFilterIndicator
          key="snapshot"
          value={(table.getColumn('snapshot')?.getFilterValue() as string[]) || []}
          onFilterChange={(value) => {
            table.getColumn('snapshot')?.setFilterValue(value)
            pushFilter('snapshot')
          }}
          snapshots={snapshots}
          snapshotsDataIsLoading={snapshotsDataIsLoading}
          snapshotsDataHasMore={snapshotsDataHasMore}
          onChangeSnapshotSearchValue={onChangeSnapshotSearchValue}
        />
      ),
    },
    {
      id: 'class',
      active: hasClassFilter,
      filter: (
        <SandboxClassFilterIndicator
          key="class"
          value={(sandboxClassColumn?.getFilterValue() as string[]) || []}
          onFilterChange={(value) => {
            sandboxClassColumn?.setFilterValue(value)
            pushFilter('class')
          }}
        />
      ),
    },
    {
      id: 'region',
      active: hasRegionFilter,
      filter: (
        <RegionFilterIndicator
          key="region"
          value={(table.getColumn('region')?.getFilterValue() as string[]) || []}
          onFilterChange={(value) => {
            table.getColumn('region')?.setFilterValue(value)
            pushFilter('region')
          }}
          options={regionOptions}
          isLoading={regionsDataIsLoading}
        />
      ),
    },
    ...RESOURCE_FILTERS.map(({ type, icon: Icon }) => ({
      id: type,
      active: Boolean(resourceFilterValue[type]),
      filter: (
        <ResourceFilterIndicator
          key={type}
          value={resourceFilterValue}
          onFilterChange={(value) => {
            table.getColumn('resources')?.setFilterValue(value)
            pushFilter(type)
          }}
          resourceType={type}
          icon={<Icon className="size-4" />}
        />
      ),
    })),
    {
      id: 'labels',
      active: hasLabelsFilter,
      filter: (
        <LabelFilterIndicator
          key="labels"
          value={(table.getColumn('labels')?.getFilterValue() as string[]) || []}
          onFilterChange={(value) => {
            table.getColumn('labels')?.setFilterValue(value)
            pushFilter('labels')
          }}
        />
      ),
    },
    {
      id: 'lastEvent',
      active: hasLastEventFilter,
      filter: (
        <LastEventFilterIndicator
          key="lastEvent"
          value={(table.getColumn('lastEvent')?.getFilterValue() as Date[]) || []}
          onFilterChange={(value) => {
            table.getColumn('lastEvent')?.setFilterValue(value)
            pushFilter('lastEvent')
          }}
        />
      ),
    },
    {
      id: 'createdAt',
      active: hasCreatedAtFilter,
      filter: (
        <CreatedAtFilterIndicator
          key="createdAt"
          value={(table.getColumn('createdAt')?.getFilterValue() as Date[]) || []}
          onFilterChange={(value) => {
            table.getColumn('createdAt')?.setFilterValue(value)
            pushFilter('createdAt')
          }}
        />
      ),
    },
    {
      id: 'visibility',
      active: hasIsPublicFilter,
      filter: (
        <BooleanFilterIndicator
          key="visibility"
          label="Visibility"
          valueLabels={VISIBILITY_FILTER_LABELS}
          icon={<Eye className="size-4" />}
          value={table.getColumn('isPublic')?.getFilterValue() as boolean | undefined}
          onFilterChange={(value) => {
            table.getColumn('isPublic')?.setFilterValue(value)
            pushFilter('visibility')
          }}
        />
      ),
    },
    {
      id: 'recovery',
      active: hasIsRecoverableFilter,
      filter: (
        <BooleanFilterIndicator
          key="recovery"
          label="Recovery"
          valueLabels={RECOVERY_FILTER_LABELS}
          icon={<Wrench className="size-4" />}
          value={table.getColumn('isRecoverable')?.getFilterValue() as boolean | undefined}
          onFilterChange={(value) => {
            table.getColumn('isRecoverable')?.setFilterValue(value)
            pushFilter('recovery')
          }}
        />
      ),
    },
  ]
  const activeFilters = [
    ...facetFilterOrder.flatMap((filterId) => {
      const filter = facetFilters.find(({ id }) => id === filterId)
      return filter?.active ? [filter] : []
    }),
    ...facetFilters.filter(({ id, active }) => active && !facetFilterOrder.includes(id)),
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <SearchInput
            debounced
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
            onValueChange={(value) => table.getColumn('name')?.setFilterValue(value)}
            placeholder="Search by Name"
            containerClassName="min-w-0 flex-1 sm:max-w-sm"
          />

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <ResponsiveButton
                  icon={<ListFilter className="size-4" />}
                  variant="outline"
                  className="shrink-0 bg-transparent hover:bg-accent dark:bg-input/50 dark:hover:bg-accent"
                >
                  Filter
                </ResponsiveButton>
              }
            />
            <DropdownMenuContent className="w-48" align="start">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Square className="w-4 h-4" />
                  State
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-0 w-64">
                    <StateFilter
                      value={(table.getColumn('state')?.getFilterValue() as string[]) || []}
                      onFilterChange={(value) => {
                        table.getColumn('state')?.setFilterValue(value)
                        pushFilter('state')
                      }}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              {showClassFilter && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Boxes className="w-4 h-4" />
                    Class
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="p-0 w-64">
                      <SandboxClassFilter
                        value={(sandboxClassColumn?.getFilterValue() as string[]) || []}
                        onFilterChange={(value) => {
                          sandboxClassColumn?.setFilterValue(value)
                          pushFilter('class')
                        }}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Camera className="w-4 h-4" />
                  Snapshot
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-0 w-64">
                    <SnapshotFilter
                      value={(table.getColumn('snapshot')?.getFilterValue() as string[]) || []}
                      onFilterChange={(value) => {
                        table.getColumn('snapshot')?.setFilterValue(value)
                        pushFilter('snapshot')
                      }}
                      snapshots={snapshots}
                      snapshotsDataIsLoading={snapshotsDataIsLoading}
                      snapshotsDataHasMore={snapshotsDataHasMore}
                      onChangeSnapshotSearchValue={onChangeSnapshotSearchValue}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Globe className="w-4 h-4" />
                  Region
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-0 w-64">
                    <RegionFilter
                      value={(table.getColumn('region')?.getFilterValue() as string[]) || []}
                      onFilterChange={(value) => {
                        table.getColumn('region')?.setFilterValue(value)
                        pushFilter('region')
                      }}
                      options={regionOptions}
                      isLoading={regionsDataIsLoading}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              {RESOURCE_FILTERS.map(({ type, label, icon: Icon }) => (
                <DropdownMenuSub key={type}>
                  <DropdownMenuSubTrigger>
                    <Icon className="w-4 h-4" />
                    {label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="p-3 w-64">
                      <ResourceFilter
                        value={(table.getColumn('resources')?.getFilterValue() as ResourceFilterValue) || {}}
                        onFilterChange={(value) => {
                          table.getColumn('resources')?.setFilterValue(value)
                          pushFilter(type)
                        }}
                        resourceType={type}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Tag className="w-4 h-4" />
                  Labels
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-0 w-64">
                    <LabelFilter
                      value={(table.getColumn('labels')?.getFilterValue() as string[]) || []}
                      onFilterChange={(value) => {
                        table.getColumn('labels')?.setFilterValue(value)
                        pushFilter('labels')
                      }}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Calendar className="w-4 h-4" />
                  Last Event
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-3 w-92">
                    <LastEventFilter
                      onFilterChange={(value) => {
                        table.getColumn('lastEvent')?.setFilterValue(value)
                        pushFilter('lastEvent')
                      }}
                      value={(table.getColumn('lastEvent')?.getFilterValue() as Date[]) || []}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CalendarPlus className="w-4 h-4" />
                  Created
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-3 w-92">
                    <CreatedAtFilter
                      onFilterChange={(value) => {
                        table.getColumn('createdAt')?.setFilterValue(value)
                        pushFilter('createdAt')
                      }}
                      value={(table.getColumn('createdAt')?.getFilterValue() as Date[]) || []}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Eye className="w-4 h-4" />
                  Visibility
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-2 w-48">
                    <BooleanFilter
                      label="Visibility"
                      valueLabels={VISIBILITY_FILTER_LABELS}
                      onFilterChange={(value) => {
                        table.getColumn('isPublic')?.setFilterValue(value)
                        pushFilter('visibility')
                      }}
                      value={table.getColumn('isPublic')?.getFilterValue() as boolean | undefined}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Wrench className="w-4 h-4" />
                  Recovery
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-2 w-48">
                    <BooleanFilter
                      label="Recovery"
                      valueLabels={RECOVERY_FILTER_LABELS}
                      onFilterChange={(value) => {
                        table.getColumn('isRecoverable')?.setFilterValue(value)
                        pushFilter('recovery')
                      }}
                      value={table.getColumn('isRecoverable')?.getFilterValue() as boolean | undefined}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <TooltipButton
            variant="outline"
            size="icon-sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="shrink-0"
            tooltipText="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', { 'animate-spin': isRefreshing })} />
          </TooltipButton>
          <DataTableConfigMenu
            table={table}
            persistenceKey="sandboxes"
            excludedColumnIds={SANDBOX_TABLE_CONFIG_EXCLUDED_COLUMN_IDS}
            getColumnLabel={(columnId) => SANDBOX_TABLE_COLUMN_LABELS[columnId] ?? columnId}
          />
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {activeFilters.map(({ filter }) => filter)}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-3 text-muted-foreground hover:text-foreground"
            onClick={handleClearFilters}
          >
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  )
}
