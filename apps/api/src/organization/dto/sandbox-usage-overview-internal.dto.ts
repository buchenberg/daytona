export type SandboxUsageOverviewInternalDto = {
  currentCpuUsage: number
  currentMemoryUsage: number
  currentDiskUsage: number
  currentGpuUsage: number
}

export type PendingSandboxUsageOverviewInternalDto = {
  pendingCpuUsage: number | null
  pendingMemoryUsage: number | null
  pendingDiskUsage: number | null
  pendingGpuUsage: number | null
}

export type SandboxUsageOverviewWithPendingInternalDto = SandboxUsageOverviewInternalDto &
  PendingSandboxUsageOverviewInternalDto
