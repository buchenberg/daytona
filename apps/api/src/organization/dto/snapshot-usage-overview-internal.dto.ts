export type SnapshotUsageOverviewInternalDto = {
  currentSnapshotUsage: number
}

export type PendingSnapshotUsageOverviewInternalDto = {
  pendingSnapshotUsage: number | null
}

export type SnapshotUsageOverviewWithPendingInternalDto = SnapshotUsageOverviewInternalDto &
  PendingSnapshotUsageOverviewInternalDto
