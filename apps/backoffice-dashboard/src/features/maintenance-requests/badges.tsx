import { Badge } from '@dashboard/ui/badge'
import { MaintenanceStatus, MaintenanceType } from '@daytonaio/backoffice-api-client'
import { cn, statusLabel } from '@backoffice/lib/utils'

const REQUEST_STATUS_COLORS: Record<MaintenanceStatus, string> = {
  [MaintenanceStatus.REQUESTED]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  [MaintenanceStatus.ACKNOWLEDGED]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  [MaintenanceStatus.DRAINING]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  [MaintenanceStatus.READY_FOR_MAINTENANCE]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  [MaintenanceStatus.IN_MAINTENANCE]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  [MaintenanceStatus.RESTORED]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  [MaintenanceStatus.CLOSED]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  [MaintenanceStatus.CANCELLED]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

export const RequestStatusBadge = ({ status }: { status: MaintenanceStatus }) => (
  <Badge className={cn('font-normal whitespace-nowrap', REQUEST_STATUS_COLORS[status])}>{statusLabel(status)}</Badge>
)

const REQUEST_TYPE_COLORS: Record<MaintenanceType, string> = {
  [MaintenanceType.DRAIN]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  [MaintenanceType.REBOOT]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  [MaintenanceType.REINSTALL]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  [MaintenanceType.DECOMMISSION]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  [MaintenanceType.OTHER]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

export const RequestTypeBadge = ({ type }: { type: MaintenanceType }) => (
  <Badge className={cn('font-normal', REQUEST_TYPE_COLORS[type])}>{type}</Badge>
)

const PRIORITY_VARIANTS = ['destructive', 'warning', 'info', 'secondary'] as const

/** 0 = p0 (most urgent) … 3 = p3 */
export const PriorityBadge = ({ priority }: { priority: number }) => (
  <Badge variant={PRIORITY_VARIANTS[priority] ?? 'secondary'} className="font-normal">
    P{priority}
  </Badge>
)
