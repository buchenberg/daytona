export type VolumeUsageOverviewInternalDto = {
  currentVolumeUsage: number
}

export type PendingVolumeUsageOverviewInternalDto = {
  pendingVolumeUsage: number | null
}

export type VolumeUsageOverviewWithPendingInternalDto = VolumeUsageOverviewInternalDto &
  PendingVolumeUsageOverviewInternalDto
