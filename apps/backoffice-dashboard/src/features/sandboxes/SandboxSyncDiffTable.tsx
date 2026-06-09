/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Badge } from '@dashboard/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dashboard/ui/table'
import { cn } from '@backoffice/lib/utils'
import type { SandboxSyncDiffEntry, SandboxSyncDiffField } from '../../types'

interface SandboxSyncDiffTableProps {
  diff: SandboxSyncDiffEntry[]
  showOnlyMismatches: boolean
}

const FIELD_LABELS: Record<SandboxSyncDiffField, string> = {
  state: 'state',
  desiredState: 'desiredState',
  lastActivityAt: 'lastActivityAt',
  errorReason: 'errorReason',
  backupState: 'backupState',
}

const renderValue = (value: string | null | undefined) => {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground">missing in OpenSearch</span>
  }
  if (value === '<unset>') {
    return <span className="italic text-muted-foreground">&lt;unset&gt;</span>
  }
  return <span className="font-mono text-xs break-all">{value}</span>
}

export const SandboxSyncDiffTable = ({ diff, showOnlyMismatches }: SandboxSyncDiffTableProps) => {
  const visibleDiff = showOnlyMismatches ? diff.filter((entry) => entry.status === 'mismatch') : diff

  if (visibleDiff.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
        {showOnlyMismatches ? 'No mismatches detected.' : 'No fields to compare.'}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[160px]">Field</TableHead>
          <TableHead>Database</TableHead>
          <TableHead>OpenSearch</TableHead>
          <TableHead className="w-[100px] text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleDiff.map((entry) => (
          <TableRow
            key={entry.field}
            className={cn(entry.status === 'mismatch' && 'bg-amber-50/40 dark:bg-amber-950/20')}
          >
            <TableCell className="font-medium font-mono text-xs">{FIELD_LABELS[entry.field]}</TableCell>
            <TableCell className="align-top">{renderValue(entry.dbValue)}</TableCell>
            <TableCell className="align-top">{renderValue(entry.osValue)}</TableCell>
            <TableCell className="text-right">
              {entry.status === 'match' ? (
                <Badge className="font-normal bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  MATCH
                </Badge>
              ) : (
                <Badge className="font-normal bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  MISMATCH
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
