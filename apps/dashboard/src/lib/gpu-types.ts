import { GpuType } from '@daytona/api-client'

/** Maximum GPUs per sandbox; mirrors MAX_GPU_PER_SANDBOX in the API's GPU resource policy. */
export const MAX_GPU_PER_SANDBOX = 8

/** GPU types a user can pick in create flows; excludes the generated-client fallback value. */
export const SELECTABLE_GPU_TYPES = (Object.values(GpuType) as GpuType[]).filter(
  (t) => t !== GpuType.UNKNOWN_DEFAULT_OPEN_API,
)

/**
 * GPU types offered for a region. A region that reports no concrete types
 * allows all selectable types; a reported list is filtered to drop the
 * generated-client fallback value.
 */
export const resolveAllowedGpuTypes = (regionAllowed: GpuType[] | null | undefined): GpuType[] => {
  const filteredRegion = (regionAllowed ?? []).filter((t) => t !== GpuType.UNKNOWN_DEFAULT_OPEN_API)
  return filteredRegion.length > 0 ? filteredRegion : SELECTABLE_GPU_TYPES
}

export const GPU_TYPE_LABELS: Record<GpuType, string> = {
  [GpuType.H100]: 'NVIDIA H100',
  [GpuType.H200]: 'NVIDIA H200',
  [GpuType.RTX_PRO_6000]: 'NVIDIA RTX PRO 6000',
  [GpuType.RTX_4090]: 'NVIDIA RTX 4090',
  [GpuType.RTX_5090]: 'NVIDIA RTX 5090',
  [GpuType.UNKNOWN_DEFAULT_OPEN_API]: '',
}

export function getGpuTypeLabel(gpuType: GpuType | undefined | null): string | undefined {
  if (!gpuType || gpuType === GpuType.UNKNOWN_DEFAULT_OPEN_API) {
    return undefined
  }

  return GPU_TYPE_LABELS[gpuType] || gpuType
}
