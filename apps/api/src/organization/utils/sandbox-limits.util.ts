import { Organization } from '../entities/organization.entity'
import { RegionQuotaDto } from '../dto/region-quota.dto'

/**
 * Get the effective per-sandbox limits.
 *
 * @param organization - The organization to get the limits for.
 * @param regionQuota - The region quota to get the limits for.
 * @param gpuUnits - The sandbox's GPU units. `0` selects the non-GPU limits;
 *   `>= 1` selects the GPU-aware maxima, which are per GPU unit and are
 *   multiplied by this count.
 * @returns The effective per-sandbox limits.
 */
export function getEffectivePerSandboxLimits(
  organization: Organization,
  regionQuota: RegionQuotaDto | null | undefined,
  gpuUnits: number,
): {
  maxCpuPerSandbox: number
  maxMemoryPerSandbox: number
  maxDiskPerSandbox: number
  maxDiskPerNonEphemeralSandbox: number | null
} {
  if (gpuUnits > 0) {
    const maxCpuPerGpu = regionQuota?.maxCpuPerGpu ?? regionQuota?.maxCpuPerSandbox ?? organization.maxCpuPerSandbox
    const maxMemoryPerGpu =
      regionQuota?.maxMemoryPerGpu ?? regionQuota?.maxMemoryPerSandbox ?? organization.maxMemoryPerSandbox
    const maxDiskPerGpu = regionQuota?.maxDiskPerGpu ?? regionQuota?.maxDiskPerSandbox ?? organization.maxDiskPerSandbox

    return {
      maxCpuPerSandbox: maxCpuPerGpu * gpuUnits,
      maxMemoryPerSandbox: maxMemoryPerGpu * gpuUnits,
      maxDiskPerSandbox: maxDiskPerGpu * gpuUnits,
      maxDiskPerNonEphemeralSandbox: null,
    }
  }

  return {
    maxCpuPerSandbox: regionQuota?.maxCpuPerSandbox ?? organization.maxCpuPerSandbox,
    maxMemoryPerSandbox: regionQuota?.maxMemoryPerSandbox ?? organization.maxMemoryPerSandbox,
    maxDiskPerSandbox: regionQuota?.maxDiskPerSandbox ?? organization.maxDiskPerSandbox,
    maxDiskPerNonEphemeralSandbox: regionQuota?.maxDiskPerNonEphemeralSandbox ?? null,
  }
}
