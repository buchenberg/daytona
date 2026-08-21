import { RegionRoutingService } from './region-routing.service'
import {
  CODE_DEDICATED_REGIONS_PER_ORGANIZATION,
  LARGE_SANDBOX_ORGS,
  LARGE_SANDBOX_SHARED_REGION,
  RL01_REGION,
  META_LARGE_SANDBOX_CPU_CORES,
  META_LARGE_SANDBOX_DISK_GB,
  META_LARGE_SANDBOX_MEMORY_GB,
  META_LARGE_SANDBOX_ORGS,
  META_LARGE_SANDBOX_REGION,
  WRITER_DEDICATED_US,
} from '../../sandbox/constants/dedicated-regions.constant'

const META_ORG_ID = [...META_LARGE_SANDBOX_ORGS][0]
const LARGE_SANDBOX_ORG_ID = [...LARGE_SANDBOX_ORGS][0]
const OTHER_ORG_ID = '00000000-0000-0000-0000-000000000099'

// The exact org IDs routed `us` -> `RL01` (seeded as `meta-dedicated` by pre-deploy
// migration 1784000000000, then renamed to `RL01` by post-deploy migration 1784000000001).
// Kept in sync with the "Org routing: Meta us" UPDATE in the pre-deploy migration; the
// last three were added when Pytorch, Meta AI Workflows and Snorkel moved to the meta fleet.
const META_RL01_ORG_IDS = [
  'fd4f4489-5a9b-4d7b-b62e-dbd26113115c', // Meta
  '683acf39-5b83-49eb-9c43-f8056cec924a', // Drydock
  'bfd70412-3a0f-4973-bd7c-f8234d933dfd', // Meta AAI Labs
  '37424cf2-c171-45a7-9628-e0ccc0f17750', // Meta TBR
  '1fa758b9-6ef2-4ef0-9d2c-6477d4666f07', // Pytorch
  'cbd6042b-5425-4bce-8fad-e5673fded021', // Meta AI Workflows
  'bac16d29-0ad6-49ab-93fa-bb0d9131be56', // Snorkel-AI-Prod
]

// The org IDs routed `us` -> `RL02` (Deeptune + Million); seeded as `deeptune-dedicated`
// by pre-deploy migration 1784000000000 and renamed to `RL02` by post-deploy 1784000000001.
const DEEPTUNE_RL02_ORG_IDS = [
  'c0a5d258-844b-44da-aac0-706f31c3027f', // deeptune
  'c8789392-ea10-4be4-9b24-71c23a6c30da', // deeptune
  'c543c338-b39a-4abf-a07a-095c0b23a380', // million
]

describe('RegionRoutingService', () => {
  function createService(opts?: {
    regions?: Array<{ id: string; fallbackRegionId: string | null; spilloverOnError: boolean }>
    routingRows?: Array<{ organizationId: string; regionId: string; effectiveRegionId: string | null }>
    defaultQuota?: { maxCpuPerSandbox: number; maxMemoryPerSandbox: number; maxDiskPerSandbox: number }
  }) {
    const regionRepository = {
      find: jest.fn().mockResolvedValue(
        opts?.regions ?? [
          { id: 'RL01', fallbackRegionId: 'us', spilloverOnError: true },
          { id: 'RL02', fallbackRegionId: 'us', spilloverOnError: true },
          { id: 'writer-dedicated-us', fallbackRegionId: 'us', spilloverOnError: true },
          { id: 'writer-dedicated-eu', fallbackRegionId: 'eu', spilloverOnError: false },
          { id: 'us', fallbackRegionId: null, spilloverOnError: true },
          { id: 'eu', fallbackRegionId: null, spilloverOnError: true },
        ],
      ),
    }
    const regionQuotaRepository = {
      find: jest.fn().mockResolvedValue(
        opts?.routingRows ?? [
          { organizationId: META_ORG_ID, regionId: 'us', effectiveRegionId: RL01_REGION },
          {
            organizationId: 'writer-org',
            regionId: 'us',
            effectiveRegionId: WRITER_DEDICATED_US,
          },
          {
            organizationId: 'writer-org',
            regionId: 'eu',
            effectiveRegionId: 'writer-dedicated-eu',
          },
          {
            organizationId: 'deeptune-org',
            regionId: 'us',
            effectiveRegionId: 'RL02',
          },
          { organizationId: 'null-effective-org', regionId: 'us', effectiveRegionId: null },
        ],
      ),
    }
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(
        opts?.defaultQuota ?? {
          maxCpuPerSandbox: 4,
          maxMemoryPerSandbox: 8,
          maxDiskPerSandbox: 10,
        },
      ),
    }

    const service = new RegionRoutingService(
      regionRepository as never,
      regionQuotaRepository as never,
      configService as never,
    )

    return { service, regionRepository, regionQuotaRepository, configService }
  }

  async function readyService(opts?: Parameters<typeof createService>[0]): Promise<ReturnType<typeof createService>> {
    const created = createService(opts)
    await created.service.refresh()
    return created
  }

  describe('refresh / cache', () => {
    it('loads fallback, routing, and spillover-on-error caches from the database', async () => {
      const { service, regionRepository, regionQuotaRepository } = await readyService()

      expect(regionRepository.find).toHaveBeenCalled()
      expect(regionQuotaRepository.find).toHaveBeenCalled()
      expect(service.getFallbackRegion('RL01')).toBe('us')
      expect(service.hasFallbackRegion('RL01')).toBe(true)
      expect(service.hasFallbackRegion('us')).toBe(false)
      expect(service.isSpilloverOnErrorRegion('RL01')).toBe(true)
      expect(service.isSpilloverOnErrorRegion('writer-dedicated-eu')).toBe(false)
      expect(service.isSpilloverOnErrorRegion('us')).toBe(true)
      expect(service.resolveEffectiveRegion(META_ORG_ID, 'us', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe(
        RL01_REGION,
      )
    })

    it('skips routing rows with a null effectiveRegionId', async () => {
      const { service } = await readyService()

      expect(service.resolveEffectiveRegion('null-effective-org', 'us', { cpu: 1, memory: 1, disk: 1, gpu: 0 })).toBe(
        'us',
      )
    })

    it('replaces caches on subsequent refresh', async () => {
      const { service, regionRepository, regionQuotaRepository } = await readyService()

      regionRepository.find.mockResolvedValue([{ id: 'RL01', fallbackRegionId: 'eu', spilloverOnError: false }])
      regionQuotaRepository.find.mockResolvedValue([])
      await service.refresh()

      expect(service.getFallbackRegion('RL01')).toBe('eu')
      expect(service.isSpilloverOnErrorRegion('RL01')).toBe(false)
      expect(service.resolveEffectiveRegion(META_ORG_ID, 'us', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe('us')
    })
  })

  describe('resolveEffectiveRegion', () => {
    it('returns the base region when no routing applies', async () => {
      const { service } = await readyService()

      expect(service.resolveEffectiveRegion(OTHER_ORG_ID, 'us', { cpu: 1, memory: 1, disk: 1, gpu: 0 })).toBe('us')
    })

    it('applies DB-backed dedicated routing for matching org+base region', async () => {
      const { service } = await readyService()

      expect(service.resolveEffectiveRegion('writer-org', 'us', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe(
        WRITER_DEDICATED_US,
      )
      expect(service.resolveEffectiveRegion('writer-org', 'eu', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe(
        'writer-dedicated-eu',
      )
      expect(service.resolveEffectiveRegion('writer-org', 'us', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).not.toBe(
        'writer-dedicated-eu',
      )
    })

    it('does not apply DB routing for a different base region', async () => {
      const { service } = await readyService()

      expect(service.resolveEffectiveRegion(META_ORG_ID, 'eu', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe('eu')
    })

    describe('GPU placement', () => {
      it('keeps Meta orgs on RL01 for us GPU sandboxes', async () => {
        const { service } = await readyService()

        expect(service.resolveEffectiveRegion(META_ORG_ID, 'us', { cpu: 4, memory: 8, disk: 10, gpu: 1 })).toBe(
          RL01_REGION,
        )
      })

      it('transparently places non-Meta eu GPU sandboxes on us', async () => {
        const { service } = await readyService()

        expect(service.resolveEffectiveRegion(OTHER_ORG_ID, 'eu', { cpu: 4, memory: 8, disk: 10, gpu: 1 })).toBe('us')
      })

      it('leaves non-Meta us GPU sandboxes on us', async () => {
        const { service } = await readyService()

        expect(service.resolveEffectiveRegion(OTHER_ORG_ID, 'us', { cpu: 4, memory: 8, disk: 10, gpu: 1 })).toBe('us')
      })

      it('does not apply Meta large-sandbox pin for GPU sandboxes', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(META_ORG_ID, 'us', {
            cpu: META_LARGE_SANDBOX_CPU_CORES + 1,
            memory: META_LARGE_SANDBOX_MEMORY_GB + 1,
            disk: META_LARGE_SANDBOX_DISK_GB + 1,
            gpu: 1,
          }),
        ).toBe(RL01_REGION)
      })
    })

    describe('Meta large-sandbox pin', () => {
      it('pins when cpu exceeds the threshold', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(META_ORG_ID, 'us', {
            cpu: META_LARGE_SANDBOX_CPU_CORES + 1,
            memory: 1,
            disk: 1,
            gpu: 0,
          }),
        ).toBe(META_LARGE_SANDBOX_REGION)
      })

      it('pins when memory exceeds the threshold', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(META_ORG_ID, 'eu', {
            cpu: 1,
            memory: META_LARGE_SANDBOX_MEMORY_GB + 1,
            disk: 1,
            gpu: 0,
          }),
        ).toBe(META_LARGE_SANDBOX_REGION)
      })

      it('pins when disk exceeds the threshold', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(META_ORG_ID, 'us', {
            cpu: 1,
            memory: 1,
            disk: META_LARGE_SANDBOX_DISK_GB + 1,
            gpu: 0,
          }),
        ).toBe(META_LARGE_SANDBOX_REGION)
      })

      it('does not pin when resources are at or below all thresholds', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(META_ORG_ID, 'us', {
            cpu: META_LARGE_SANDBOX_CPU_CORES,
            memory: META_LARGE_SANDBOX_MEMORY_GB,
            disk: META_LARGE_SANDBOX_DISK_GB,
            gpu: 0,
          }),
        ).toBe(RL01_REGION)
      })

      it('takes precedence over DB dedicated routing', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(META_ORG_ID, 'us', {
            cpu: META_LARGE_SANDBOX_CPU_CORES + 1,
            memory: 1,
            disk: 1,
            gpu: 0,
          }),
        ).toBe(META_LARGE_SANDBOX_REGION)
      })

      it('does not pin non-Meta orgs', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(OTHER_ORG_ID, 'us', {
            cpu: META_LARGE_SANDBOX_CPU_CORES + 1,
            memory: META_LARGE_SANDBOX_MEMORY_GB + 1,
            disk: META_LARGE_SANDBOX_DISK_GB + 1,
            gpu: 0,
          }),
        ).toBe('us')
      })
    })

    describe('large-sandbox shared region', () => {
      it('routes oversized sandboxes for LARGE_SANDBOX_ORGS', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(LARGE_SANDBOX_ORG_ID, 'us', {
            cpu: 8,
            memory: 16,
            disk: 20,
            gpu: 0,
          }),
        ).toBe(LARGE_SANDBOX_SHARED_REGION)
      })

      it('keeps default-sized sandboxes on the base region', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(LARGE_SANDBOX_ORG_ID, 'us', {
            cpu: 2,
            memory: 4,
            disk: 5,
            gpu: 0,
          }),
        ).toBe('us')
      })

      it('does not apply to orgs outside LARGE_SANDBOX_ORGS', async () => {
        const { service } = await readyService()

        expect(
          service.resolveEffectiveRegion(OTHER_ORG_ID, 'us', {
            cpu: 8,
            memory: 16,
            disk: 20,
            gpu: 0,
          }),
        ).toBe('us')
      })
    })
  })

  describe('fallback helpers', () => {
    it('returns fallback region or null', async () => {
      const { service } = await readyService()

      expect(service.getFallbackRegion('RL01')).toBe('us')
      expect(service.getFallbackRegion('writer-dedicated-eu')).toBe('eu')
      expect(service.getFallbackRegion('us')).toBeNull()
      expect(service.getFallbackRegion('unknown')).toBeNull()
    })

    it('maps a list of regions to their fallbacks, dropping missing ones', async () => {
      const { service } = await readyService()

      expect(service.getFallbackRegions(['RL01', 'us', 'writer-dedicated-eu', 'missing'])).toEqual(['us', 'eu'])
      expect(service.getFallbackRegions([])).toEqual([])
    })
  })

  describe('isSpilloverOnErrorRegion', () => {
    it('is region-scoped, not org-scoped', async () => {
      const { service } = await readyService()

      // Any sandbox on RL01 qualifies — there is no org allowlist.
      expect(service.isSpilloverOnErrorRegion('RL01')).toBe(true)
      expect(service.isSpilloverOnErrorRegion('RL02')).toBe(true)
      // Explicitly disabled on writer-dedicated-eu even though it has a fallback.
      expect(service.isSpilloverOnErrorRegion('writer-dedicated-eu')).toBe(false)
      expect(service.isSpilloverOnErrorRegion('unknown')).toBe(false)
    })
  })

  describe('dedicated region lookups', () => {
    it('merges DB-backed dedicated regions with code-only mappings', async () => {
      const { service } = await readyService()

      const metaRegions = service.getDedicatedRegionsForOrg(META_ORG_ID)
      expect(metaRegions).toContain(RL01_REGION)

      const largeRegions = service.getDedicatedRegionsForOrg(LARGE_SANDBOX_ORG_ID)
      expect(largeRegions).toEqual(
        expect.arrayContaining(CODE_DEDICATED_REGIONS_PER_ORGANIZATION[LARGE_SANDBOX_ORG_ID] ?? []),
      )

      const writerRegions = service.getDedicatedRegionsForOrg('writer-org')
      expect(writerRegions).toEqual(expect.arrayContaining([WRITER_DEDICATED_US, 'writer-dedicated-eu']))
      expect(new Set(writerRegions).size).toBe(writerRegions.length)
    })

    it('returns code-only dedicated regions for orgs with no DB routing', async () => {
      const { service } = await readyService({ routingRows: [] })

      expect(service.getDedicatedRegionsForOrg(LARGE_SANDBOX_ORG_ID)).toEqual([LARGE_SANDBOX_SHARED_REGION])
      expect(service.getDedicatedRegionsForOrg(OTHER_ORG_ID)).toEqual([])
    })

    it('lists org ids with any dedicated region (DB or code)', async () => {
      const { service } = await readyService()

      const orgIds = service.getDedicatedRegionOrgIds()
      expect(orgIds).toEqual(expect.arrayContaining([META_ORG_ID, 'writer-org', LARGE_SANDBOX_ORG_ID]))
      expect(orgIds).not.toContain(OTHER_ORG_ID)
      expect(new Set(orgIds).size).toBe(orgIds.length)
    })

    it('returns org ids routed to a dedicated region via DB only', async () => {
      const { service } = await readyService()

      expect(service.getOrgIdsRoutedTo(RL01_REGION)).toEqual([META_ORG_ID])
      expect(service.getOrgIdsRoutedTo(WRITER_DEDICATED_US)).toEqual(['writer-org'])
      expect(service.getOrgIdsRoutedTo(LARGE_SANDBOX_SHARED_REGION)).toEqual([])
      expect(service.getOrgIdsRoutedTo('unknown')).toEqual([])
    })
  })

  describe('Meta org routing contract (mirrors migration 1784000000000)', () => {
    async function metaService() {
      return readyService({
        regions: [
          { id: 'RL01', fallbackRegionId: 'us', spilloverOnError: true },
          { id: 'us', fallbackRegionId: null, spilloverOnError: true },
          { id: 'eu', fallbackRegionId: null, spilloverOnError: true },
        ],
        routingRows: META_RL01_ORG_IDS.map((organizationId) => ({
          organizationId,
          regionId: 'us',
          effectiveRegionId: RL01_REGION,
        })),
      })
    }

    it('routes every Meta org us -> RL01 (incl. Pytorch, Meta AI Workflows, Snorkel)', async () => {
      const { service } = await metaService()

      for (const org of META_RL01_ORG_IDS) {
        expect(service.resolveEffectiveRegion(org, 'us', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe(RL01_REGION)
      }
    })

    it('keeps every Meta org on RL01 for us GPU sandboxes', async () => {
      const { service } = await metaService()

      for (const org of META_RL01_ORG_IDS) {
        expect(service.resolveEffectiveRegion(org, 'us', { cpu: 4, memory: 8, disk: 10, gpu: 1 })).toBe(RL01_REGION)
      }
    })

    it('pins oversized Meta sandboxes to the large-sandbox region (and every routed org is large-pinned)', async () => {
      const { service } = await metaService()

      for (const org of META_RL01_ORG_IDS) {
        // Invariant linking the migration routing to the in-code large-sandbox allowlist:
        // every org routed to RL01 must also be pinned when oversized.
        expect(META_LARGE_SANDBOX_ORGS.has(org)).toBe(true)
        expect(
          service.resolveEffectiveRegion(org, 'us', {
            cpu: META_LARGE_SANDBOX_CPU_CORES + 1,
            memory: 1,
            disk: 1,
            gpu: 0,
          }),
        ).toBe(META_LARGE_SANDBOX_REGION)
      }
    })

    it('does not route Meta orgs for the eu base region', async () => {
      const { service } = await metaService()

      for (const org of META_RL01_ORG_IDS) {
        expect(service.resolveEffectiveRegion(org, 'eu', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe('eu')
      }
    })

    it('makes RL01 spill over to us on runner errors', async () => {
      const { service } = await metaService()

      expect(service.hasFallbackRegion(RL01_REGION)).toBe(true)
      expect(service.getFallbackRegion(RL01_REGION)).toBe('us')
      expect(service.isSpilloverOnErrorRegion(RL01_REGION)).toBe(true)
    })

    it('propagates snapshots for every Meta org to RL01', async () => {
      const { service } = await metaService()

      const orgIds = service.getDedicatedRegionOrgIds()
      const orgsRoutedToRL01 = service.getOrgIdsRoutedTo(RL01_REGION)
      for (const org of META_RL01_ORG_IDS) {
        expect(orgIds).toContain(org)
        expect(service.getDedicatedRegionsForOrg(org)).toContain(RL01_REGION)
        expect(orgsRoutedToRL01).toContain(org)
      }
    })
  })

  describe('Deeptune/Million org routing contract (mirrors migration 1784000000000)', () => {
    async function deeptuneService() {
      return readyService({
        regions: [
          { id: 'RL02', fallbackRegionId: 'us', spilloverOnError: true },
          { id: 'us', fallbackRegionId: null, spilloverOnError: true },
          { id: 'eu', fallbackRegionId: null, spilloverOnError: true },
        ],
        routingRows: DEEPTUNE_RL02_ORG_IDS.map((organizationId) => ({
          organizationId,
          regionId: 'us',
          effectiveRegionId: 'RL02',
        })),
      })
    }

    it('routes every Deeptune/Million org us -> RL02 with error spillover to us', async () => {
      const { service } = await deeptuneService()

      for (const org of DEEPTUNE_RL02_ORG_IDS) {
        expect(service.resolveEffectiveRegion(org, 'us', { cpu: 2, memory: 4, disk: 4, gpu: 0 })).toBe('RL02')
        expect(service.getDedicatedRegionsForOrg(org)).toContain('RL02')
      }
      expect(service.hasFallbackRegion('RL02')).toBe(true)
      expect(service.getFallbackRegion('RL02')).toBe('us')
      expect(service.isSpilloverOnErrorRegion('RL02')).toBe(true)
    })
  })

  describe('lifecycle', () => {
    it('refreshes on init and clears the timer on destroy', async () => {
      jest.useFakeTimers()
      try {
        const { service, regionRepository } = createService()
        await service.onModuleInit()
        expect(regionRepository.find).toHaveBeenCalledTimes(1)

        regionRepository.find.mockClear()
        await jest.advanceTimersByTimeAsync(60_000)
        expect(regionRepository.find).toHaveBeenCalled()

        service.onModuleDestroy()
      } finally {
        jest.useRealTimers()
      }
    })

    it('refreshes on region created/deleted events', async () => {
      const { service, regionRepository } = await readyService()
      regionRepository.find.mockClear()

      await service.onRegionChanged()
      expect(regionRepository.find).toHaveBeenCalled()
    })
  })
})
