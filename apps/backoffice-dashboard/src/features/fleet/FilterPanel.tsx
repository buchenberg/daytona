import { useState, useEffect } from 'react'
import { FilterDrawer } from '@backoffice/components/FilterDrawer'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Checkbox } from '@dashboard/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { FleetRunnerFiltersDto } from '@daytonaio/backoffice-api-client'
import { RunnerState } from '../../types'
import { useFleetFilterOptions } from './useFleet'

// All prod runner states plus the synthetic 'missing' (no prod row for the domain)
const PROD_STATES = [...Object.values(RunnerState), 'missing']
const ANY = 'any'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: FleetRunnerFiltersDto
  onApply: (filters: FleetRunnerFiltersDto) => void
  onReset: () => void
}

export const FilterPanel = ({ open, onClose, filters, onApply, onReset }: FilterPanelProps) => {
  const [localFilters, setLocalFilters] = useState<FleetRunnerFiltersDto>(filters)
  const { data: options } = useFleetFilterOptions()

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

  const select = (label: string, key: keyof FleetRunnerFiltersDto, values: string[] | undefined) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={(localFilters[key] as string | undefined) ?? ANY}
        onValueChange={(value) => setLocalFilters((prev) => ({ ...prev, [key]: value === ANY ? undefined : value }))}
      >
        <SelectTrigger>
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {(values ?? []).map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <FilterDrawer open={open} onOpenChange={onClose} title="Filter Fleet" onApply={handleApply} onReset={handleReset}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search">Name, IP or domain</Label>
          <Input
            id="search"
            placeholder="Search by name, IP or domain"
            value={localFilters.search || ''}
            onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
          />
        </div>

        {select('Env', 'env', options?.envs)}
        {select('Provider', 'provider', options?.providers)}
        {select('Region (inventory)', 'invRegion', options?.invRegions)}
        {select('Region (production)', 'prodRegion', options?.prodRegions)}
        {select('Tenant', 'tenant', options?.tenants)}
        {select('Prod state', 'prodState', PROD_STATES)}

        <div className="flex items-center space-x-2">
          <Checkbox
            id="enabledOnly"
            checked={localFilters.enabledOnly || false}
            onCheckedChange={(checked) =>
              setLocalFilters((prev) => ({ ...prev, enabledOnly: (checked as boolean) || undefined }))
            }
          />
          <Label htmlFor="enabledOnly" className="text-sm font-normal">
            Enabled only
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="gpuOnly"
            checked={localFilters.gpuOnly || false}
            onCheckedChange={(checked) =>
              setLocalFilters((prev) => ({ ...prev, gpuOnly: (checked as boolean) || undefined }))
            }
          />
          <Label htmlFor="gpuOnly" className="text-sm font-normal">
            GPU only
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="includeRemoved"
            checked={localFilters.includeRemoved || false}
            onCheckedChange={(checked) =>
              setLocalFilters((prev) => ({ ...prev, includeRemoved: (checked as boolean) || undefined }))
            }
          />
          <Label htmlFor="includeRemoved" className="text-sm font-normal">
            Include removed from inventory
          </Label>
        </div>
      </div>
    </FilterDrawer>
  )
}
