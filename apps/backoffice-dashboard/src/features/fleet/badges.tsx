import { Badge } from '@dashboard/ui/badge'
import { cn } from '@backoffice/lib/utils'

const PROD_STATE_COLORS: Record<string, string> = {
  ready: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  disabled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  unresponsive: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  initializing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  decommissioned: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

/** State of the matching production runner; null means not registered in prod. */
export const ProdStateBadge = ({ state }: { state: string | null | undefined }) => {
  if (!state) return <Badge variant="outline">missing</Badge>
  return (
    <Badge className={cn('font-normal', PROD_STATE_COLORS[state] ?? PROD_STATE_COLORS.disabled)}>
      {state.toUpperCase()}
    </Badge>
  )
}
