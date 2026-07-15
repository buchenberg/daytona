import { Link, useParams } from 'react-router'
import dayjs from 'dayjs'
import { ArrowLeft } from 'lucide-react'
import { PageLayout, PageHeaderBase, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/ui/card'
import { Badge } from '@dashboard/ui/badge'
import { Button } from '@dashboard/ui/button'
import { FleetRunnerDetailDto } from '@daytonaio/backoffice-api-client'
import { statusLabel } from '@backoffice/lib/utils'
import { useFleetRunner } from '../features/fleet/useFleet'
import { ProdStateBadge } from '../features/fleet/badges'
import { PriorityBadge, RequestStatusBadge, RequestTypeBadge } from '../features/maintenance-requests/badges'

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right">{children}</span>
  </div>
)

const SpecCard = ({ runner }: { runner: FleetRunnerDetailDto }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Spec</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      <Field label="Model">{runner.model ?? '—'}</Field>
      <Field label="Server type">{runner.serverType ?? '—'}</Field>
      <Field label="Location">{[runner.geo, runner.region, runner.location].filter(Boolean).join(' · ') || '—'}</Field>
      <Field label="NIC">{runner.nicSpeed ?? '—'}</Field>
      <Field label="Cost">
        {runner.monthlyCost ? `${runner.monthlyCost}/mo` : runner.hourlyCost ? `${runner.hourlyCost}/h` : '—'}
      </Field>
      <Field label="OS">{runner.os ?? '—'}</Field>
      <Field label="IP">
        <span className="font-mono">{runner.ip ?? '—'}</span>
      </Field>
      <div className="flex flex-wrap gap-1 pt-2">
        {runner.groups.map((group) => (
          <Badge key={group} variant="outline">
            {group}
          </Badge>
        ))}
      </div>
    </CardContent>
  </Card>
)

const ProductionCard = ({ runner }: { runner: FleetRunnerDetailDto }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Production</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      {!runner.prod ? (
        <p className="text-sm text-muted-foreground">Not present in production.</p>
      ) : (
        <>
          <Field label="Region">{runner.prod.region}</Field>
          <Field label="CPU usage">{Math.round(runner.prod.currentCpuUsagePercentage)}%</Field>
          <Field label="Memory usage">{Math.round(runner.prod.currentMemoryUsagePercentage)}%</Field>
          <Field label="Disk usage">{Math.round(runner.prod.currentDiskUsagePercentage)}%</Field>
          <Field label="Capacity">
            {runner.prod.cpu} cpu · {runner.prod.memoryGiB} GiB mem · {runner.prod.diskGiB} GiB disk
            {runner.prod.gpu ? ` · ${runner.prod.gpu}× ${runner.prod.gpuType ?? 'gpu'}` : ''}
          </Field>
          <Field label="Allocated CPU">{runner.prod.currentAllocatedCpu}</Field>
          <Field label="Started sandboxes">{runner.prod.currentStartedSandboxes}</Field>
          <Field label="Snapshots">{runner.prod.currentSnapshotCount}</Field>
          <Field label="Availability score">{runner.prod.availabilityScore?.toFixed(2) ?? '—'}</Field>
          <Field label="Sandbox class">{runner.prod.sandboxClass}</Field>
          <Field label="App version">{runner.prod.appVersion ?? '—'}</Field>
          <Field label="Last checked">
            {runner.prod.lastChecked ? dayjs(runner.prod.lastChecked).fromNow() : 'never'}
          </Field>
        </>
      )}
    </CardContent>
  </Card>
)

const DrainCard = ({ drain }: { drain: NonNullable<FleetRunnerDetailDto['drain']> }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Drain status</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      {drain.remaining === 0 ? (
        <p className="text-sm text-green-600 dark:text-green-400">Fully drained</p>
      ) : (
        <>
          <Field label="Remaining">{drain.remaining}</Field>
          <Field label="Started">{drain.started}</Field>
          <Field label="Stopped without backup">{drain.stoppedWithoutBackup}</Field>
        </>
      )}
    </CardContent>
  </Card>
)

const SandboxesCard = ({ runner }: { runner: FleetRunnerDetailDto }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Sandboxes</CardTitle>
    </CardHeader>
    <CardContent>
      {runner.sandboxStates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sandboxes</p>
      ) : (
        <div className="space-y-1">
          {runner.sandboxStates.map((entry) => (
            <Field key={entry.state} label={entry.state}>
              {entry.count}
            </Field>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)

const RequestsCard = ({ runner }: { runner: FleetRunnerDetailDto }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Requests ({runner.requests.length})</CardTitle>
    </CardHeader>
    <CardContent>
      {runner.requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No maintenance requests target this runner.</p>
      ) : (
        <div className="space-y-1">
          {runner.requests.map((request) => (
            <Link
              key={request.id}
              to={`/maintenance-requests/${request.id}`}
              className="-mx-2 flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <span className="text-sm font-medium">{request.title}</span>
              <RequestTypeBadge type={request.type} />
              <PriorityBadge priority={request.priority} />
              <RequestStatusBadge status={request.status} />
              <span className="text-xs text-muted-foreground">{dayjs(request.createdAt).fromNow()}</span>
            </Link>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)

const EventsCard = ({ runner }: { runner: FleetRunnerDetailDto }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Events</CardTitle>
    </CardHeader>
    <CardContent>
      {runner.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events recorded.</p>
      ) : (
        <div className="space-y-3">
          {runner.events.map((event) => (
            <div key={event.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{statusLabel(event.type)}</Badge>
                {event.requestId && (
                  <Link to={`/maintenance-requests/${event.requestId}`} className="text-xs hover:underline">
                    request
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
    </CardContent>
  </Card>
)

export const FleetRunnerDetailPage = () => {
  const { name = '' } = useParams()
  const { data: runner, isLoading, error } = useFleetRunner(name)

  return (
    <PageLayout>
      <PageHeaderBase>
        <Button variant="ghost" size="icon" render={<Link to="/fleet" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageTitle>
          <span className="font-mono">{name}</span>
        </PageTitle>
        {runner && (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline">{runner.env}</Badge>
            {runner.provider && <Badge variant="outline">{runner.provider}</Badge>}
            {runner.tenant && <Badge variant="outline">{runner.tenant}</Badge>}
            {runner.gpu && <Badge variant="secondary">GPU</Badge>}
            <Badge variant={runner.enabled ? 'success' : 'secondary'}>{runner.enabled ? 'enabled' : 'disabled'}</Badge>
            <ProdStateBadge state={runner.prod?.state} />
            {runner.prod?.draining && <Badge variant="warning">draining</Badge>}
            {runner.prod &&
              (runner.prod.unschedulable ? (
                <Badge variant="warning">unschedulable</Badge>
              ) : (
                <Badge variant="success">schedulable</Badge>
              ))}
            {runner.removedAt && <Badge variant="destructive">removed {dayjs(runner.removedAt).fromNow()}</Badge>}
          </div>
        )}
      </PageHeaderBase>
      <PageContent size="full">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error || !runner ? (
          <p className="text-sm text-destructive">Could not load runner {name}</p>
        ) : (
          <div className="space-y-4">
            {runner.domain && <p className="text-sm text-muted-foreground font-mono">{runner.domain}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <SpecCard runner={runner} />
              <ProductionCard runner={runner} />
              {runner.drain && <DrainCard drain={runner.drain} />}
              <SandboxesCard runner={runner} />
              <RequestsCard runner={runner} />
              <EventsCard runner={runner} />
            </div>
          </div>
        )}
      </PageContent>
    </PageLayout>
  )
}
