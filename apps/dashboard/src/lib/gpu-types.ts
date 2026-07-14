import { GpuType } from '@daytona/api-client'

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
