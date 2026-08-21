import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { ArrowLeft, Check, Pencil } from 'lucide-react'
import { PageLayout, PageHeaderBase, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/ui/card'
import { Badge } from '@dashboard/ui/badge'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dashboard/ui/table'
import { MaintenanceRequestDetailDto, MaintenanceStatus } from '@daytonaio/backoffice-api-client'
import BackofficeApiClient from '../api/BackofficeApiClient'
import { handleUpdateError } from '../lib/api'
import { statusLabel } from '@backoffice/lib/utils'
import { useHasPermission } from '../providers/ApiProvider'
import { useMaintenanceRequest } from '../features/maintenance-requests/useMaintenanceRequests'
import { EditRequestModal } from '../features/maintenance-requests/EditRequestModal'
import { PriorityBadge, RequestStatusBadge, RequestTypeBadge } from '../features/maintenance-requests/badges'
import { ProdStateBadge } from '../features/fleet/badges'

const StatusActions = ({ request, onDone }: { request: MaintenanceRequestDetailDto; onDone: () => void }) => {
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const targets = request.allowedTransitions

  if (targets.length === 0) return null

  const transition = async (status: MaintenanceStatus) => {
    try {
      setActing(true)
      await BackofficeApiClient.transitionMaintenanceRequest(request.id, {
        status,
        comment: comment || undefined,
      })
      toast.success(`Request moved to ${statusLabel(status)}`)
      setComment('')
      onDone()
    } catch (error) {
      handleUpdateError(error, 'Failed to change status')
    } finally {
      setActing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {targets.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={status === MaintenanceStatus.CANCELLED ? 'destructive' : 'default'}
              disabled={acting}
              onClick={() => transition(status)}
            >
              {statusLabel(status)}
            </Button>
          ))}
        </div>
        <Input placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      </CardContent>
    </Card>
  )
}

const ProgressCard = ({ request }: { request: MaintenanceRequestDetailDto }) => {
  const drained = request.progress.filter((p) => p.drained).length
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Drain progress ({drained}/{request.progress.length} drained)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Runner</TableHead>
              <TableHead>Prod state</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>No backup</TableHead>
              <TableHead>Drained</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {request.progress.map((p) => (
              <TableRow key={p.name}>
                <TableCell>
                  <Link to={`/fleet/${p.name}`} className="font-mono hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <ProdStateBadge state={p.prodState} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {p.draining && <Badge variant="warning">draining</Badge>}
                    {p.unschedulable && <Badge variant="warning">unschedulable</Badge>}
                  </div>
                </TableCell>
                <TableCell>{p.remaining}</TableCell>
                <TableCell>{p.started}</TableCell>
                <TableCell>{p.stoppedWithoutBackup}</TableCell>
                <TableCell>{p.drained && <Check className="h-4 w-4 text-green-600 dark:text-green-400" />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

const TimelineCard = ({
  request,
  canWrite,
  onDone,
}: {
  request: MaintenanceRequestDetailDto
  canWrite: boolean
  onDone: () => void
}) => {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const addNote = async () => {
    try {
      setSaving(true)
      await BackofficeApiClient.addMaintenanceNote(request.id, note)
      setNote('')
      onDone()
    } catch (error) {
      handleUpdateError(error, 'Failed to add note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes & events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {request.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {request.events.map((event) => (
              <div key={event.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{statusLabel(event.type)}</Badge>
                  {event.runnerName && (
                    <Link to={`/fleet/${event.runnerName}`} className="font-mono text-xs hover:underline">
                      {event.runnerName}
                    </Link>
                  )}
                </div>
                <p className="mt-1">{event.message}</p>
                <p className="text-xs text-muted-foreground">
                  {event.actor} · {dayjs(event.createdAt).fromNow()}
                </p>
              </div>
            ))}
          </div>
        )}
        {canWrite && (
          <div className="flex gap-2">
            <Input placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button onClick={addNote} disabled={saving || note.trim().length === 0}>
              Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export const MaintenanceRequestDetailPage = () => {
  const { id = '' } = useParams()
  const canWrite = useHasPermission('fleet', 'write')
  const { data: request, isLoading, error, refetch } = useMaintenanceRequest(id)
  const [editOpen, setEditOpen] = useState(false)
  const queryClient = useQueryClient()

  // The prefix invalidation also covers this page's own detail query.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
    queryClient.invalidateQueries({ queryKey: ['fleet-runners'] })
  }

  return (
    <PageLayout>
      <PageHeaderBase>
        <Button variant="ghost" size="icon" render={<Link to="/fleet" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageTitle>{request?.title ?? 'Maintenance request'}</PageTitle>
        {request && (
          <div className="flex items-center gap-1">
            <RequestTypeBadge type={request.type} />
            <PriorityBadge priority={request.priority} />
            <RequestStatusBadge status={request.status} />
            {canWrite && (
              <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} title="Edit request">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </PageHeaderBase>
      <PageContent size="full">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error || !request ? (
          <p className="text-sm text-destructive">Could not load request</p>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              requested by {request.requestedBy} · created by {request.createdBy} {dayjs(request.createdAt).fromNow()}
            </div>
            {request.description && <p className="text-sm">{request.description}</p>}

            {canWrite && <StatusActions request={request} onDone={refresh} />}
            <ProgressCard request={request} />
            <TimelineCard request={request} canWrite={canWrite} onDone={() => refetch()} />

            <EditRequestModal
              request={request}
              open={editOpen}
              onClose={() => setEditOpen(false)}
              onSuccess={refresh}
            />
          </div>
        )}
      </PageContent>
    </PageLayout>
  )
}
