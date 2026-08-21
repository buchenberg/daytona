import { BadRequestError } from '../../exceptions/bad-request.exception'

export const MAX_GPU_PER_SANDBOX = 8

// Defaults applied to GPU creates that omit cpu/memory/disk. Flat per
// sandbox regardless of the requested GPU count - they do not scale with it.
export const GPU_SANDBOX_DEFAULT_CPU = 16
export const GPU_SANDBOX_DEFAULT_MEMORY = 192
export const GPU_SANDBOX_DEFAULT_DISK = 512

export interface SandboxResourceRequest {
  cpu?: number
  memory?: number
  disk?: number
  gpu?: number
}

export function assertGpuTypeRequiresGpu(gpu: number | undefined, gpuType: unknown[] | undefined): void {
  if ((gpu ?? 0) <= 0 && gpuType && gpuType.length > 0) {
    throw new BadRequestError('GPU type can only be specified when requesting GPU resources')
  }
}

/**
 * Applies the GPU resource policy to a create request: GPU requests get the
 * GPU defaults for omitted cpu/memory/disk, and all values must be positive.
 * Non-GPU requests get `nonGpuDefaults` for omitted or zero values when
 * provided, and pass through unchanged otherwise.
 */
export function normalizeSandboxResourcesForCreate(
  resources: SandboxResourceRequest,
  nonGpuDefaults: { cpu: number; memory: number; disk: number; gpu: number },
): { cpu: number; memory: number; disk: number; gpu: number }
export function normalizeSandboxResourcesForCreate(resources: SandboxResourceRequest): SandboxResourceRequest
export function normalizeSandboxResourcesForCreate(
  resources: SandboxResourceRequest,
  nonGpuDefaults?: { cpu: number; memory: number; disk: number; gpu: number },
): SandboxResourceRequest {
  const gpu = resources.gpu ?? nonGpuDefaults?.gpu ?? 0

  if (gpu <= 0) {
    if (!nonGpuDefaults) {
      return resources
    }
    return {
      ...resources,
      cpu: resources.cpu || nonGpuDefaults.cpu,
      memory: resources.memory || nonGpuDefaults.memory,
      disk: resources.disk || nonGpuDefaults.disk,
      gpu,
    }
  }

  const cpu = resources.cpu ?? GPU_SANDBOX_DEFAULT_CPU
  const memory = resources.memory ?? GPU_SANDBOX_DEFAULT_MEMORY
  const disk = resources.disk ?? GPU_SANDBOX_DEFAULT_DISK

  if (cpu <= 0 || memory <= 0 || disk <= 0) {
    throw new BadRequestError('CPU, memory, and disk must be greater than 0 when requesting GPU resources')
  }

  return { ...resources, cpu, memory, disk, gpu }
}
