/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CopyButton } from '@/components/CopyButton'
import { TimestampTooltip } from '@/components/TimestampTooltip'
import TooltipButton from '@/components/TooltipButton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetSectionTitle, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuditLogQuery } from '@/hooks/queries/useAuditLogQuery'
import { getMaskedTokenFromParts, getRelativeTimeString } from '@/lib/utils'
import { AuditLog } from '@daytona/api-client'
import { ChevronDown, ChevronUp, CircleAlert, ListFilter, X } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { getOutcomeCategory, getOutcomeInfo } from './auditLogOutcome'

export interface AuditLogDetailSheetProps {
  open: boolean
  auditLogId: string | null
  seedLog?: AuditLog
  onOpenChange: (open: boolean) => void
  onApplyFilter?: (field: string, value: string) => void
  onNavigate?: (direction: 'prev' | 'next') => void
  hasPrev?: boolean
  hasNext?: boolean
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function outcomeBadgeVariant(statusCode: number | null | undefined): 'success' | 'destructive' | 'secondary' {
  const category = getOutcomeCategory(statusCode)
  if (category === 'success') return 'success'
  if (category === 'client-error' || category === 'server-error') return 'destructive'
  return 'secondary'
}

export function AuditLogDetailSheet({
  open,
  auditLogId,
  seedLog,
  onOpenChange,
  onApplyFilter,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: AuditLogDetailSheetProps) {
  const { data: log, isLoading } = useAuditLogQuery(auditLogId, seedLog)

  const applyFilter = onApplyFilter
    ? (field: string, value: string) => {
        onApplyFilter(field, value)
        onOpenChange(false)
      }
    : undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-dvw flex-col gap-0 p-0 sm:w-130 [&>button]:hidden" side="right">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 p-4 px-5">
          <SheetTitle>Log Details</SheetTitle>
          <div className="flex items-center">
            {onNavigate && (
              <>
                <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={() => onNavigate('prev')}>
                  <ChevronUp className="size-4" />
                  <span className="sr-only">Previous log</span>
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={!hasNext} onClick={() => onNavigate('next')}>
                  <ChevronDown className="size-4" />
                  <span className="sr-only">Next log</span>
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <Separator />

        {log ? (
          <AuditLogDetailContent log={log} applyFilter={applyFilter} />
        ) : isLoading ? (
          <AuditLogDetailSkeleton />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            This audit log could not be loaded.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function AuditLogDetailContent({
  log,
  applyFilter,
}: {
  log: AuditLog
  applyFilter?: (field: string, value: string) => void
}) {
  const outcome = getOutcomeInfo(log.statusCode)
  const actorType = log.actorApiKeyPrefix ? 'API key' : 'User'
  const maskedApiKey =
    log.actorApiKeyPrefix && log.actorApiKeySuffix
      ? getMaskedTokenFromParts(log.actorApiKeyPrefix, log.actorApiKeySuffix)
      : undefined
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0
  const metadataJson = useMemo(() => JSON.stringify(log.metadata ?? {}, null, 2), [log.metadata])

  return (
    <ScrollArea fade="mask" className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 px-5 py-4">
        <SheetSectionTitle>Overview</SheetSectionTitle>

        <DetailRow label="Audit Log ID">
          <span className="truncate font-mono text-sm">{log.id}</span>
          <CopyButton value={log.id} size="icon-xs" tooltipText="Copy Audit Log ID" />
          {applyFilter && <FilterButton onClick={() => applyFilter('id', log.id)} />}
        </DetailRow>

        <DetailRow label="Action Type">
          <Badge variant="secondary">{log.action}</Badge>
          {applyFilter && <FilterButton onClick={() => applyFilter('action', log.action)} />}
        </DetailRow>

        <DetailRow label="Action Result">
          <Badge variant={outcomeBadgeVariant(log.statusCode)}>
            {outcome.label}
            {log.statusCode ? <span className="ml-1.5 font-mono opacity-70">{log.statusCode}</span> : null}
          </Badge>
        </DetailRow>

        <DetailRow label="Time">
          <TimestampTooltip timestamp={toIso(log.createdAt)}>
            <span className="cursor-default text-sm">{getRelativeTimeString(log.createdAt).relativeTimeString}</span>
          </TimestampTooltip>
        </DetailRow>

        {(log.actorEmail || log.actorId) && (
          <DetailRow label="Actor">
            <span className="truncate text-sm">{log.actorEmail || log.actorId}</span>
            {applyFilter && log.actorEmail && (
              <FilterButton onClick={() => applyFilter('actorEmail', log.actorEmail)} />
            )}
          </DetailRow>
        )}

        <DetailRow label="Actor Type">
          <Badge variant="outline" className="font-normal">
            {actorType}
          </Badge>
        </DetailRow>

        {maskedApiKey && (
          <DetailRow label="API Key">
            <span className="truncate font-mono text-sm">{maskedApiKey}</span>
            {applyFilter && log.actorApiKeySuffix && (
              <FilterButton onClick={() => applyFilter('actorApiKeySuffix', log.actorApiKeySuffix as string)} />
            )}
          </DetailRow>
        )}

        {log.targetType && (
          <DetailRow label="Target Type">
            <Badge variant="secondary">{log.targetType}</Badge>
            {applyFilter && <FilterButton onClick={() => applyFilter('targetType', log.targetType as string)} />}
          </DetailRow>
        )}

        {log.targetId && (
          <DetailRow label="Resource ID">
            <span className="truncate font-mono text-sm">{log.targetId}</span>
            <CopyButton value={log.targetId} size="icon-xs" tooltipText="Copy Resource ID" />
            {applyFilter && <FilterButton onClick={() => applyFilter('targetId', log.targetId as string)} />}
          </DetailRow>
        )}

        {log.ipAddress && (
          <DetailRow label="IP Address">
            <span className="truncate font-mono text-sm">{log.ipAddress}</span>
          </DetailRow>
        )}

        {log.source && (
          <DetailRow label="Source">
            <span className="truncate text-sm">{log.source}</span>
          </DetailRow>
        )}

        {log.errorMessage && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="wrap-break-word">{log.errorMessage}</AlertDescription>
          </Alert>
        )}
      </div>

      {hasMetadata && (
        <>
          <Separator />
          <div className="flex flex-col px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SheetSectionTitle>Metadata</SheetSectionTitle>
              <CopyButton value={metadataJson} size="icon-xs" tooltipText="Copy metadata" />
            </div>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/80 p-3 font-mono text-sm">
              {metadataJson}
            </pre>
          </div>
        </>
      )}
    </ScrollArea>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="group/copy-button flex min-w-0 items-center justify-end gap-1">{children}</div>
    </div>
  )
}

function FilterButton({ onClick }: { onClick: () => void }) {
  return (
    <TooltipButton
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground hover:text-foreground"
      onClick={onClick}
      tooltipText="Filter by this value"
    >
      <ListFilter className="size-3.5" />
    </TooltipButton>
  )
}

function AuditLogDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <Skeleton className="h-5 w-24" />
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-40" />
        </div>
      ))}
    </div>
  )
}
