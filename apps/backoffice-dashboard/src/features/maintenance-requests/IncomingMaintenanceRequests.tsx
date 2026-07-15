import { Link, useNavigate } from 'react-router'
import dayjs from 'dayjs'
import { Badge } from '@dashboard/ui/badge'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { MaintenanceRequestDto } from '@daytonaio/backoffice-api-client'
import { PriorityBadge, RequestTypeBadge } from './badges'
import { useIncomingMaintenanceRequests } from './useMaintenanceRequests'

/** First few targeted runner names as chips, with a "+N more" overflow. */
const RunnerNamesCell = ({ names }: { names: string[] }) => (
  <div className="flex flex-wrap items-center gap-1">
    {names.slice(0, 3).map((name) => (
      <Badge key={name} variant="outline" className="font-mono">
        {name}
      </Badge>
    ))}
    {names.length > 3 && <span className="text-xs text-muted-foreground">+{names.length - 3} more</span>}
  </div>
)

/**
 * Notifications-page section (fleet:read): maintenance requests nobody has
 * acknowledged yet. (Email/Slack notifications will hang off this feed.)
 */
export const IncomingMaintenanceRequests = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useIncomingMaintenanceRequests()
  const requests = data?.data?.requests ?? []

  // The query is disabled without fleet:read; hide the section when quiet.
  if (isLoading || requests.length === 0) return null

  const columns: Column<MaintenanceRequestDto>[] = [
    {
      key: 'title',
      title: 'Request',
      width: '260px',
      render: (request) => (
        <Link to={`/maintenance-requests/${request.id}`} className="font-medium hover:underline">
          {request.title}
        </Link>
      ),
    },
    {
      key: 'type',
      title: 'Type',
      width: '110px',
      render: (request) => <RequestTypeBadge type={request.type} />,
    },
    {
      key: 'priority',
      title: 'Priority',
      width: '80px',
      render: (request) => <PriorityBadge priority={request.priority} />,
    },
    {
      key: 'runners',
      title: 'Runners',
      width: '240px',
      render: (request) => <RunnerNamesCell names={request.runnerNames} />,
    },
    {
      key: 'requestedBy',
      title: 'Requested by',
      width: '180px',
      render: (request) => <span className="text-sm">{request.requestedBy}</span>,
    },
    {
      key: 'createdAt',
      title: 'Created',
      width: '120px',
      render: (request) => <span className="text-sm text-muted-foreground">{dayjs(request.createdAt).fromNow()}</span>,
    },
  ]

  return (
    <div className="mb-8">
      <p className="mb-4 text-sm text-muted-foreground">Incoming maintenance requests waiting to be acknowledged.</p>
      <DataTable
        columns={columns}
        data={requests}
        loading={false}
        rowKey={(request) => request.id}
        onRowClick={(request) => navigate(`/maintenance-requests/${request.id}`)}
      />
    </div>
  )
}
