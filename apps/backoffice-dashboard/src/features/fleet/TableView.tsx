import { Filter, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import dayjs from 'dayjs'
import { Button } from '@dashboard/ui/button'
import { Badge } from '@dashboard/ui/badge'
import { Input } from '@dashboard/ui/input'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { FleetRunnerDto } from '@daytonaio/backoffice-api-client'
import { cn } from '@backoffice/lib/utils'
import { ProdStateBadge } from './badges'

interface TableViewProps {
  runners: FleetRunnerDto[]
  loading: boolean
  refreshing?: boolean
  pagination: {
    page: number
    pageSize: number
    total: number
  }
  onPaginationChange: (page: number, pageSize: number) => void
  onFilterClick: () => void
  onRefresh: () => void
  activeFilterCount: number
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string, order: 'asc' | 'desc') => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  selectedRows?: Set<string>
  onSelectionChange?: (selected: Set<string>) => void
}

const getUsageColor = (value: number): string => {
  if (value < 50) return 'bg-green-500'
  if (value < 80) return 'bg-yellow-500'
  return 'bg-red-500'
}

const UsageBar = ({ value }: { value: number | null | undefined }) => {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const rounded = Math.round(value)
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-14 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={cn('h-full transition-all', getUsageColor(value))} style={{ width: `${rounded}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{rounded}%</span>
    </div>
  )
}

export const TableView = ({
  runners,
  loading,
  refreshing = false,
  pagination,
  onPaginationChange,
  onFilterClick,
  onRefresh,
  activeFilterCount,
  sortField,
  sortOrder,
  onSortChange,
  searchValue = '',
  onSearchChange,
  selectedRows,
  onSelectionChange,
}: TableViewProps) => {
  const columns: Column<FleetRunnerDto>[] = [
    {
      key: 'name',
      title: 'Name',
      width: '180px',
      sortable: true,
      render: (runner) => (
        <div className="flex flex-col">
          <Link to={`/fleet/${runner.name}`} className="font-mono font-medium hover:underline">
            {runner.name}
          </Link>
          <span className="text-xs text-muted-foreground">{runner.domain ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'env',
      title: 'Env',
      width: '90px',
      sortable: true,
      render: (runner) => <span className="text-sm">{runner.env}</span>,
    },
    {
      key: 'provider',
      title: 'Provider',
      width: '100px',
      sortable: true,
      render: (runner) => <span className="text-sm">{runner.provider ?? '—'}</span>,
    },
    {
      key: 'regions',
      title: 'Region (inv / prod)',
      width: '170px',
      render: (runner) => (
        <div className="flex flex-col text-xs leading-tight">
          <span>{runner.region ?? runner.location ?? '—'}</span>
          <span className="text-muted-foreground">{runner.prod?.region ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'model',
      title: 'Model',
      width: '150px',
      render: (runner) => (
        <div className="flex items-center gap-1">
          <span className="text-sm">{runner.model ?? '—'}</span>
          {runner.gpu && <Badge variant="secondary">GPU</Badge>}
        </div>
      ),
    },
    {
      key: 'tenant',
      title: 'Tenant',
      width: '100px',
      sortable: true,
      render: (runner) => <span className="text-sm">{runner.tenant ?? '—'}</span>,
    },
    {
      key: 'inventory',
      title: 'Inv',
      width: '80px',
      render: (runner) => (
        <Badge
          className={
            runner.enabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
          }
        >
          {runner.enabled ? 'on' : 'off'}
        </Badge>
      ),
    },
    {
      key: 'prodState',
      title: 'Prod',
      width: '130px',
      sortable: true,
      render: (runner) => (
        <div className="flex flex-wrap items-center gap-1">
          <ProdStateBadge state={runner.prod?.state} />
          {runner.prod?.draining && <Badge variant="warning">draining</Badge>}
          {runner.prod &&
            (runner.prod.unschedulable ? (
              <Badge variant="warning">unschedulable</Badge>
            ) : (
              <Badge variant="success">schedulable</Badge>
            ))}
        </div>
      ),
    },
    {
      key: 'activeSandboxes',
      title: 'Sbx',
      width: '70px',
      sortable: true,
      render: (runner) => <span className="text-sm">{runner.activeSandboxes}</span>,
    },
    {
      key: 'cpuUsage',
      title: 'CPU',
      width: '110px',
      sortable: true,
      render: (runner) => <UsageBar value={runner.prod?.currentCpuUsagePercentage} />,
    },
    {
      key: 'memoryUsage',
      title: 'Memory',
      width: '110px',
      sortable: true,
      render: (runner) => <UsageBar value={runner.prod?.currentMemoryUsagePercentage} />,
    },
    {
      key: 'diskUsage',
      title: 'Disk',
      width: '110px',
      sortable: true,
      render: (runner) => <UsageBar value={runner.prod?.currentDiskUsagePercentage} />,
    },
    {
      key: 'availabilityScore',
      title: 'Score',
      width: '80px',
      sortable: true,
      render: (runner) => <span className="text-sm">{runner.prod?.availabilityScore?.toFixed(2) ?? '—'}</span>,
    },
    {
      key: 'openRequests',
      title: 'Reqs',
      width: '70px',
      sortable: true,
      render: (runner) =>
        runner.openRequests > 0 ? (
          <Badge variant="warning">{runner.openRequests}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">0</span>
        ),
    },
    {
      key: 'provisionedAt',
      title: 'Provisioned',
      width: '120px',
      sortable: true,
      render: (runner) => (
        <span className="text-sm text-muted-foreground">
          {runner.provisionedAt ? dayjs(runner.provisionedAt).fromNow() : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onFilterClick}>
          <Filter className="mr-2 h-4 w-4" />
          Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </Button>
        <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
        {onSearchChange && (
          <Input
            placeholder="Search by name, IP or domain..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[220px]"
          />
        )}
      </div>

      <DataTable
        columns={columns}
        data={runners}
        loading={loading}
        rowKey={(runner) => runner.name}
        selectedRows={selectedRows}
        onSelectionChange={onSelectionChange}
        pagination={pagination}
        onPaginationChange={onPaginationChange}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
      />
    </div>
  )
}
