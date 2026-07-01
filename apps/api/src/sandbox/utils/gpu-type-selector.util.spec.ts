/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { GpuType } from '../enums/gpu-type.enum'
import { resolveGpuTypeSelector, runnerMatchesGpuTypeSelector, resolvePinnedGpuType } from './gpu-type-selector.util'

describe('resolveGpuTypeSelector', () => {
  it('returns null for non-GPU sandboxes regardless of GPU type fields', () => {
    expect(resolveGpuTypeSelector({ gpu: 0, gpuType: GpuType.H100 })).toBeNull()
    expect(resolveGpuTypeSelector({ gpu: 0, gpuTypePreferences: [GpuType.RTX_PRO_6000] })).toBeNull()
  })

  it('prefers a concrete pinned gpuType over the preference list', () => {
    expect(
      resolveGpuTypeSelector({
        gpu: 1,
        gpuType: GpuType.H100,
        gpuTypePreferences: [GpuType.RTX_PRO_6000],
      }),
    ).toBe(GpuType.H100)
  })

  it('falls back to the preference list when gpuType is not yet pinned', () => {
    expect(resolveGpuTypeSelector({ gpu: 1, gpuType: null, gpuTypePreferences: [GpuType.RTX_PRO_6000] })).toEqual([
      GpuType.RTX_PRO_6000,
    ])
  })

  it('returns null when a GPU sandbox has neither a pinned type nor preferences', () => {
    expect(resolveGpuTypeSelector({ gpu: 1 })).toBeNull()
    expect(resolveGpuTypeSelector({ gpu: 1, gpuType: null, gpuTypePreferences: [] })).toBeNull()
  })
})

describe('runnerMatchesGpuTypeSelector', () => {
  it('matches any runner when the selector is null', () => {
    expect(runnerMatchesGpuTypeSelector(GpuType.H100, null)).toBe(true)
    expect(runnerMatchesGpuTypeSelector(null, null)).toBe(true)
  })

  it('requires an exact match for a single-value selector', () => {
    expect(runnerMatchesGpuTypeSelector(GpuType.RTX_PRO_6000, GpuType.RTX_PRO_6000)).toBe(true)
    expect(runnerMatchesGpuTypeSelector(GpuType.H100, GpuType.RTX_PRO_6000)).toBe(false)
    expect(runnerMatchesGpuTypeSelector(null, GpuType.RTX_PRO_6000)).toBe(false)
  })

  it('requires membership for a preference-list selector', () => {
    const selector = [GpuType.RTX_PRO_6000, GpuType.H100]
    expect(runnerMatchesGpuTypeSelector(GpuType.H100, selector)).toBe(true)
    expect(runnerMatchesGpuTypeSelector(GpuType.RTX_PRO_6000, selector)).toBe(true)
    expect(runnerMatchesGpuTypeSelector(null, selector)).toBe(false)
  })

  it('does not match a non-GPU runner against an empty preference list', () => {
    expect(runnerMatchesGpuTypeSelector(GpuType.H100, [])).toBe(false)
  })
})

describe('resolvePinnedGpuType', () => {
  it('returns undefined for non-GPU sandboxes', () => {
    expect(resolvePinnedGpuType({ gpu: 0 }, GpuType.H100)).toBeUndefined()
  })

  it('returns undefined when the runner has no GPU type', () => {
    expect(resolvePinnedGpuType({ gpu: 1, gpuType: null }, null)).toBeUndefined()
  })

  it('returns undefined when the sandbox is already pinned to the runner type', () => {
    expect(resolvePinnedGpuType({ gpu: 1, gpuType: GpuType.RTX_PRO_6000 }, GpuType.RTX_PRO_6000)).toBeUndefined()
  })

  it('returns the runner type when pinning an unpinned GPU sandbox', () => {
    expect(resolvePinnedGpuType({ gpu: 1, gpuType: null }, GpuType.RTX_PRO_6000)).toBe(GpuType.RTX_PRO_6000)
  })

  it('returns the runner type when correcting a mismatched pin', () => {
    expect(resolvePinnedGpuType({ gpu: 1, gpuType: GpuType.H100 }, GpuType.RTX_PRO_6000)).toBe(GpuType.RTX_PRO_6000)
  })
})
