import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Copy, RefreshCw, XCircle } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@dashboard/ui/sheet'
import { Button } from '@dashboard/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dashboard/ui/tabs'
import { Switch } from '@dashboard/ui/switch'
import { Label } from '@dashboard/ui/label'
import { Spinner } from '@dashboard/ui/spinner'
import { cn } from '@backoffice/lib/utils'
import { getRelativeTimeString } from '@backoffice/lib/utils'
import { useHasPermission } from '../../providers/ApiProvider'
import type { Sandbox, SandboxSyncStatusResponse } from '../../types'
import { sandboxSyncStatusQueryKey, useSandboxSyncStatus } from './useSandboxSyncStatus'
import { useForceSandboxOrganizationResync } from './useForceSandboxResync'
import { SandboxSyncDiffTable } from './SandboxSyncDiffTable'
import { SandboxSyncRawJsonTabs } from './SandboxSyncRawJsonTabs'
import { ForceResyncConfirmationDialog } from './ForceResyncConfirmationDialog'

interface SandboxSyncInspectorSheetProps {
  sandbox: Sandbox | null
  open: boolean
  onClose: () => void
}

const RESYNC_COOLDOWN_MS = 60_000
const POST_RESYNC_REFETCH_INTERVAL_MS = 10_000
const POST_RESYNC_REFETCH_WINDOW_MS = 120_000

const StatusBanner = ({ data }: { data: SandboxSyncStatusResponse }) => {
  if (!data.osDocumentFound) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="space-y-1">
          <div className="font-medium text-red-800 dark:text-red-200">Missing in OpenSearch</div>
          <div className="text-red-700 dark:text-red-300">
            This sandbox exists in the database but is not indexed in OpenSearch. This indicates a broken CDC pipeline.
            Please escalate to the platform engineering team.
          </div>
        </div>
      </div>
    )
  }

  if (data.inSync) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-green-300 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950/40">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <div className="space-y-1">
          <div className="font-medium text-green-800 dark:text-green-200">In sync</div>
          <div className="text-green-700 dark:text-green-300">
            All state-machine fields match between the database and OpenSearch. If the sandbox has been stuck in a
            transitional state for a long time, it is genuinely stuck — escalate as a runtime issue, not a sync issue.
          </div>
        </div>
      </div>
    )
  }

  const mismatchCount = data.diff.filter((entry) => entry.status === 'mismatch').length
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="space-y-1">
        <div className="font-medium text-amber-800 dark:text-amber-200">
          Out of sync — {mismatchCount} {mismatchCount === 1 ? 'mismatch' : 'mismatches'} detected
        </div>
        <div className="text-amber-700 dark:text-amber-300">
          OpenSearch is showing stale data relative to the database. Forcing a resync will trigger a Debezium
          incremental snapshot for this sandbox's organization.
        </div>
      </div>
    </div>
  )
}

export const SandboxSyncInspectorSheet = ({ sandbox, open, onClose }: SandboxSyncInspectorSheetProps) => {
  const queryClient = useQueryClient()
  const canResync = useHasPermission('sandboxes', 'resync')

  const [showOnlyMismatches, setShowOnlyMismatches] = useState(false)
  const [resyncDialogOpen, setResyncDialogOpen] = useState(false)
  const [resyncTriggeredAt, setResyncTriggeredAt] = useState<number | null>(null)
  const [resyncCooldownUntil, setResyncCooldownUntil] = useState<number | null>(null)
  const [, forceTick] = useState(0)

  const sandboxId = sandbox?.id ?? null

  const refetchInterval = useMemo(() => {
    if (resyncTriggeredAt === null) return false as const
    const elapsed = Date.now() - resyncTriggeredAt
    if (elapsed >= POST_RESYNC_REFETCH_WINDOW_MS) return false as const
    return POST_RESYNC_REFETCH_INTERVAL_MS
  }, [resyncTriggeredAt])

  const syncStatusQuery = useSandboxSyncStatus({
    sandboxId,
    enabled: open && Boolean(sandboxId),
    refetchInterval,
  })

  const resyncMutation = useForceSandboxOrganizationResync()

  useEffect(() => {
    if (!open) {
      setShowOnlyMismatches(false)
      setResyncDialogOpen(false)
      setResyncTriggeredAt(null)
      setResyncCooldownUntil(null)
    }
  }, [open])

  useEffect(() => {
    if (open && syncStatusQuery.data?.inSync === false) {
      setShowOnlyMismatches(true)
    }
  }, [open, syncStatusQuery.data?.inSync])

  useEffect(() => {
    if (resyncCooldownUntil === null && resyncTriggeredAt === null) {
      return
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const cooldownDone = resyncCooldownUntil !== null && now >= resyncCooldownUntil
      const refetchWindowDone = resyncTriggeredAt !== null && now - resyncTriggeredAt >= POST_RESYNC_REFETCH_WINDOW_MS

      if (cooldownDone) {
        setResyncCooldownUntil(null)
      }
      if (refetchWindowDone) {
        setResyncTriggeredAt(null)
      }
      forceTick((tick) => tick + 1)
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [resyncCooldownUntil, resyncTriggeredAt])

  const handleRefresh = useCallback(async () => {
    if (!sandboxId) return
    try {
      await syncStatusQuery.refetch()
    } catch {
      // surfaced via syncStatusQuery.error below
    }
  }, [sandboxId, syncStatusQuery])

  const handleResyncConfirm = useCallback(async () => {
    if (!sandboxId) return
    try {
      const result = await resyncMutation.mutateAsync({ sandboxId })
      toast.success(`Resync triggered for every sandbox in organization ${result.organizationId}`)
      setResyncDialogOpen(false)
      setResyncTriggeredAt(Date.now())
      setResyncCooldownUntil(Date.now() + RESYNC_COOLDOWN_MS)
      await queryClient.invalidateQueries({ queryKey: sandboxSyncStatusQueryKey(sandboxId) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to trigger resync'
      toast.error(message)
    }
  }, [queryClient, resyncMutation, sandboxId])

  const handleCopySandboxId = useCallback(async () => {
    if (!sandboxId) return
    try {
      await navigator.clipboard.writeText(sandboxId)
      toast.success('Sandbox ID copied to clipboard')
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }, [sandboxId])

  const data = syncStatusQuery.data
  const error = syncStatusQuery.error
  const isLoading = syncStatusQuery.isLoading

  const cooldownRemainingSec = resyncCooldownUntil
    ? Math.max(0, Math.ceil((resyncCooldownUntil - Date.now()) / 1000))
    : 0
  const resyncOnCooldown = cooldownRemainingSec > 0

  const showResyncButton = data && data.osDocumentFound && !data.inSync

  const fetchedAtLabel = data ? getRelativeTimeString(data.fetchedAt, '-').relativeTimeString : null

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next && !resyncMutation.isPending) {
            onClose()
          }
        }}
      >
        <SheetContent side="right" className="flex flex-col gap-4 sm:max-w-[760px] sm:w-[760px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Inspect state drift</SheetTitle>
            <SheetDescription>
              Compare what is actually stored in the database against what is currently shown to the user via
              OpenSearch.
            </SheetDescription>
          </SheetHeader>

          {sandbox && (
            <div className="rounded-md border p-3 bg-muted/50 space-y-1.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Sandbox</div>
                  <div className="font-medium truncate">{sandbox.id}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCopySandboxId} className="h-7 shrink-0 gap-1.5">
                  <Copy className="h-3 w-3" />
                  Copy ID
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Organization ID: <span className="font-mono">{sandbox.organizationId}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {isLoading
                ? 'Fetching from database and OpenSearch...'
                : data
                  ? `Last fetched: ${fetchedAtLabel}`
                  : error
                    ? 'Fetch failed'
                    : ''}
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading || !sandboxId}>
              <RefreshCw className={cn('mr-2 h-3 w-3', syncStatusQuery.isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          )}

          {!isLoading && error && (
            <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="space-y-1">
                <div className="font-medium text-red-800 dark:text-red-200">Failed to load sync status</div>
                <div className="text-red-700 dark:text-red-300">
                  {error instanceof Error ? error.message : 'An unknown error occurred.'}
                </div>
              </div>
            </div>
          )}

          {data && (
            <>
              <StatusBanner data={data} />

              <Tabs defaultValue="diff" className="w-full">
                <TabsList>
                  <TabsTrigger value="diff">Diff</TabsTrigger>
                  <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="diff" className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="show-only-mismatches"
                      checked={showOnlyMismatches}
                      onCheckedChange={setShowOnlyMismatches}
                    />
                    <Label htmlFor="show-only-mismatches" className="text-sm cursor-pointer">
                      Show only mismatches
                    </Label>
                  </div>
                  <SandboxSyncDiffTable diff={data.diff} showOnlyMismatches={showOnlyMismatches} />
                </TabsContent>

                <TabsContent value="raw" className="mt-3">
                  <SandboxSyncRawJsonTabs db={data.db} opensearch={data.opensearch} />
                </TabsContent>
              </Tabs>
            </>
          )}

          <SheetFooter className="flex-row justify-end gap-2 pt-2">
            {showResyncButton && canResync && (
              <Button
                variant="destructive"
                disabled={resyncOnCooldown || resyncMutation.isPending}
                onClick={() => setResyncDialogOpen(true)}
              >
                {resyncOnCooldown
                  ? `Force organization resync (${cooldownRemainingSec}s)`
                  : 'Force organization resync'}
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={resyncMutation.isPending}>
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {data && data.osDocumentFound && !data.inSync && (
        <ForceResyncConfirmationDialog
          open={resyncDialogOpen}
          onOpenChange={setResyncDialogOpen}
          organizationId={data.organizationId}
          sandboxId={data.sandboxId}
          loading={resyncMutation.isPending}
          onConfirm={handleResyncConfirm}
        />
      )}
    </>
  )
}
