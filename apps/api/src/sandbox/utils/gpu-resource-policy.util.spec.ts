import {
  GPU_SANDBOX_DEFAULT_CPU,
  GPU_SANDBOX_DEFAULT_DISK,
  GPU_SANDBOX_DEFAULT_MEMORY,
  assertGpuTypeRequiresGpu,
  normalizeSandboxResourcesForCreate,
} from './gpu-resource-policy.util'

describe('gpu-resource-policy.util', () => {
  describe('assertGpuTypeRequiresGpu', () => {
    it('rejects GPU type preferences without GPU resources', () => {
      expect(() => assertGpuTypeRequiresGpu(0, ['nvidia_l4'])).toThrow(
        'GPU type can only be specified when requesting GPU resources',
      )
    })

    it('allows GPU type preferences when GPU resources are requested', () => {
      expect(() => assertGpuTypeRequiresGpu(1, ['nvidia_l4'])).not.toThrow()
    })
  })

  describe('normalizeSandboxResourcesForCreate', () => {
    const defaults = { cpu: 1, memory: 1, disk: 3, gpu: 0 }

    it('uses regular defaults for non-GPU sandboxes', () => {
      expect(normalizeSandboxResourcesForCreate({}, defaults)).toEqual({
        cpu: 1,
        memory: 1,
        disk: 3,
        gpu: 0,
      })
    })

    it('defaults explicit zero resources for non-GPU sandboxes', () => {
      expect(normalizeSandboxResourcesForCreate({ cpu: 0, memory: 0, disk: 0, gpu: 0 }, defaults)).toEqual({
        cpu: 1,
        memory: 1,
        disk: 3,
        gpu: 0,
      })
    })

    it('returns non-GPU resources unchanged without defaults', () => {
      expect(normalizeSandboxResourcesForCreate({ cpu: 2, memory: 4, disk: 20 })).toEqual({
        cpu: 2,
        memory: 4,
        disk: 20,
      })
    })

    it('uses flat GPU defaults for any GPU count', () => {
      for (const gpu of [1, 4]) {
        const expected = {
          cpu: GPU_SANDBOX_DEFAULT_CPU,
          memory: GPU_SANDBOX_DEFAULT_MEMORY,
          disk: GPU_SANDBOX_DEFAULT_DISK,
          gpu,
        }
        expect(normalizeSandboxResourcesForCreate({ gpu }, defaults)).toEqual(expected)
        expect(normalizeSandboxResourcesForCreate({ gpu })).toEqual(expected)
      }
    })

    it('fills only omitted values with GPU defaults', () => {
      expect(normalizeSandboxResourcesForCreate({ gpu: 2, cpu: 32 }, defaults)).toEqual({
        cpu: 32,
        memory: GPU_SANDBOX_DEFAULT_MEMORY,
        disk: GPU_SANDBOX_DEFAULT_DISK,
        gpu: 2,
      })
    })

    it('rejects zero resources for single-GPU sandboxes', () => {
      expect(() => normalizeSandboxResourcesForCreate({ gpu: 1, cpu: 0, memory: 192, disk: 512 }, defaults)).toThrow(
        'CPU, memory, and disk must be greater than 0 when requesting GPU resources',
      )
      expect(() => normalizeSandboxResourcesForCreate({ gpu: 1, cpu: 16, memory: 0, disk: 512 }, defaults)).toThrow(
        'CPU, memory, and disk must be greater than 0 when requesting GPU resources',
      )
      expect(() => normalizeSandboxResourcesForCreate({ gpu: 1, cpu: 16, memory: 192, disk: 0 }, defaults)).toThrow(
        'CPU, memory, and disk must be greater than 0 when requesting GPU resources',
      )
    })

    it('rejects zero resources for multi-GPU sandboxes', () => {
      expect(() => normalizeSandboxResourcesForCreate({ gpu: 2, cpu: 0, memory: 384, disk: 1024 }, defaults)).toThrow(
        'CPU, memory, and disk must be greater than 0 when requesting GPU resources',
      )
      expect(() => normalizeSandboxResourcesForCreate({ gpu: 2, cpu: 32, memory: 0, disk: 1024 }, defaults)).toThrow(
        'CPU, memory, and disk must be greater than 0 when requesting GPU resources',
      )
      expect(() => normalizeSandboxResourcesForCreate({ gpu: 2, cpu: 32, memory: 384, disk: 0 }, defaults)).toThrow(
        'CPU, memory, and disk must be greater than 0 when requesting GPU resources',
      )
    })

    it('preserves explicit resources for multi-GPU sandboxes', () => {
      expect(normalizeSandboxResourcesForCreate({ gpu: 2, cpu: 32, memory: 384, disk: 1024 }, defaults)).toEqual({
        cpu: 32,
        memory: 384,
        disk: 1024,
        gpu: 2,
      })
    })
  })
})
