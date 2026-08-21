import { Organization } from '../entities/organization.entity'
import { RegionQuotaDto } from '../dto/region-quota.dto'
import { getEffectivePerSandboxLimits } from './sandbox-limits.util'

describe('getEffectivePerSandboxLimits', () => {
  const organization = {
    maxCpuPerSandbox: 4,
    maxMemoryPerSandbox: 8,
    maxDiskPerSandbox: 100,
  } as Organization

  it('uses regular per-sandbox limits for non-GPU sandboxes', () => {
    expect(
      getEffectivePerSandboxLimits(
        organization,
        {
          maxCpuPerSandbox: 6,
          maxMemoryPerSandbox: 12,
          maxDiskPerSandbox: 120,
          maxDiskPerNonEphemeralSandbox: 80,
        } as RegionQuotaDto,
        0,
      ),
    ).toEqual({
      maxCpuPerSandbox: 6,
      maxMemoryPerSandbox: 12,
      maxDiskPerSandbox: 120,
      maxDiskPerNonEphemeralSandbox: 80,
    })
  })

  it('multiplies GPU-specific limits by requested GPU count', () => {
    expect(
      getEffectivePerSandboxLimits(
        organization,
        {
          maxCpuPerGpu: 16,
          maxMemoryPerGpu: 192,
          maxDiskPerGpu: 512,
        } as RegionQuotaDto,
        3,
      ),
    ).toEqual({
      maxCpuPerSandbox: 48,
      maxMemoryPerSandbox: 576,
      maxDiskPerSandbox: 1536,
      maxDiskPerNonEphemeralSandbox: null,
    })
  })

  it('falls back through regular region and organization limits for GPU limits', () => {
    expect(
      getEffectivePerSandboxLimits(
        organization,
        {
          maxCpuPerSandbox: 6,
          maxMemoryPerSandbox: null,
          maxDiskPerSandbox: 120,
          maxCpuPerGpu: null,
          maxMemoryPerGpu: null,
          maxDiskPerGpu: null,
        } as RegionQuotaDto,
        2,
      ),
    ).toEqual({
      maxCpuPerSandbox: 12,
      maxMemoryPerSandbox: 16,
      maxDiskPerSandbox: 240,
      maxDiskPerNonEphemeralSandbox: null,
    })
  })
})
