import { GPU_RUNNER_RESERVATION_FREE_STATES, RunnerService } from './runner.service'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SandboxClass } from '../enums/sandbox-class.enum'
import { GpuType } from '../enums/gpu-type.enum'
import { RunnerState } from '../enums/runner-state.enum'

describe('RunnerService', () => {
  function createService(
    queryBuilder: Record<string, jest.Mock>,
    overrides: {
      runnerRepository?: Record<string, jest.Mock>
      snapshotRunnerRepository?: Record<string, jest.Mock>
      configService?: Record<string, jest.Mock>
      regionRoutingService?: Record<string, jest.Mock>
    } = {},
  ) {
    const runnerRepository = overrides.runnerRepository ?? {
      find: jest.fn(),
    }
    const sandboxRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    }
    const snapshotRunnerRepository = overrides.snapshotRunnerRepository ?? {
      find: jest.fn(),
    }

    const configService = overrides.configService ?? {
      get: jest.fn(),
      getOrThrow: jest.fn().mockReturnValue(1),
    }

    const regionRoutingService = overrides.regionRoutingService ?? {
      hasFallbackRegion: jest.fn().mockReturnValue(false),
      getFallbackRegions: jest.fn().mockReturnValue([]),
    }

    const service = new RunnerService(
      runnerRepository as never,
      {} as never,
      sandboxRepository as never,
      snapshotRunnerRepository as never,
      {} as never,
      configService as never,
      {} as never,
      regionRoutingService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    return {
      service,
      sandboxRepository,
      runnerRepository,
      snapshotRunnerRepository,
      configService,
      regionRoutingService,
    }
  }

  function createQueryBuilder(rows: Array<Record<string, unknown>>) {
    const qb: Record<string, jest.Mock> = {}
    for (const method of ['innerJoin', 'select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'having']) {
      qb[method] = jest.fn().mockReturnValue(qb)
    }
    qb.getRawMany = jest.fn().mockResolvedValue(rows)
    return qb
  }

  function createRunner(overrides: Partial<Record<string, unknown>>) {
    return {
      id: 'runner',
      state: RunnerState.READY,
      unschedulable: false,
      draining: false,
      gpu: 0,
      gpuType: null,
      sandboxClass: SandboxClass.CONTAINER,
      availabilityScore: 50,
      region: 'us',
      ...overrides,
    }
  }

  it('sums reserved GPU units per runner over live GPU sandboxes', async () => {
    const qb = createQueryBuilder([
      { runnerId: 'runner-a', reservedGpu: '5' },
      { runnerId: 'runner-b', reservedGpu: '2' },
    ])
    const { service, sandboxRepository } = createService(qb)

    await expect(service.getReservedGpuUnitsByRunnerId(['runner-a', 'runner-b', 'runner-a'])).resolves.toEqual(
      new Map([
        ['runner-a', 5],
        ['runner-b', 2],
      ]),
    )

    expect(sandboxRepository.createQueryBuilder).toHaveBeenCalledWith('sandbox')
    expect(qb.where).toHaveBeenCalledWith('sandbox.runnerId IN (:...runnerIds)', {
      runnerIds: ['runner-a', 'runner-b'],
    })
    expect(qb.andWhere).toHaveBeenCalledWith('sandbox.state NOT IN (:...freeStates)', {
      freeStates: GPU_RUNNER_RESERVATION_FREE_STATES,
    })
  })

  it('orders live GPU placement by best-fit remaining GPU capacity', async () => {
    const qb = createQueryBuilder([
      { runnerId: 'packed-runner', reservedGpu: '7' },
      { runnerId: 'full-runner', reservedGpu: '8' },
    ])
    const runnerRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          createRunner({ id: 'empty-runner', gpu: 8, gpuType: GpuType.H100, availabilityScore: 100 }),
          createRunner({ id: 'packed-runner', gpu: 8, gpuType: GpuType.H100, availabilityScore: 20 }),
          createRunner({ id: 'full-runner', gpu: 8, gpuType: GpuType.H100, availabilityScore: 99 }),
        ]),
    }
    const { service } = createService(qb, { runnerRepository })

    const runners = await service.findAvailableRunners({
      regions: ['us'],
      sandboxClass: SandboxClass.CONTAINER,
      gpu: 1,
      gpuType: GpuType.H100,
    })

    expect(runners.map((runner) => runner.id)).toEqual(['packed-runner', 'empty-runner'])
  })

  it('admits overflow (gpu = -1) runners for any request size but orders them last', async () => {
    const qb = createQueryBuilder([{ runnerId: 'overflow-runner', reservedGpu: '500' }])
    const runnerRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          createRunner({ id: 'overflow-runner', gpu: -1, gpuType: GpuType.H100, availabilityScore: 100 }),
          createRunner({ id: 'owned-runner', gpu: 8, gpuType: GpuType.H100, availabilityScore: 20 }),
        ]),
    }
    const { service } = createService(qb, { runnerRepository })

    const runners = await service.findAvailableRunners({
      regions: ['us'],
      sandboxClass: SandboxClass.CONTAINER,
      gpu: 8,
      gpuType: GpuType.H100,
    })

    expect(runners.map((runner) => runner.id)).toEqual(['owned-runner', 'overflow-runner'])
  })

  it('randomizes order among exact GPU placement ties', async () => {
    const qb = createQueryBuilder([])
    const runnerRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          createRunner({ id: 'tied-a', gpu: 8, gpuType: GpuType.H100 }),
          createRunner({ id: 'tied-b', gpu: 8, gpuType: GpuType.H100 }),
        ]),
    }
    const { service } = createService(qb, { runnerRepository })
    // Force the Fisher-Yates pass to swap the pair; a deterministic tie-break
    // (e.g. by runner id) would put tied-a first regardless.
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)

    try {
      const runners = await service.findAvailableRunners({
        regions: ['us'],
        sandboxClass: SandboxClass.CONTAINER,
        gpu: 1,
        gpuType: GpuType.H100,
      })

      expect(runners.map((runner) => runner.id)).toEqual(['tied-b', 'tied-a'])
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('only treats destroyed, archived, and build-failed GPU sandboxes as free', () => {
    expect(GPU_RUNNER_RESERVATION_FREE_STATES).toEqual([
      SandboxState.DESTROYED,
      SandboxState.ARCHIVED,
      SandboxState.BUILD_FAILED,
    ])
  })

  it('retries findAvailableRunners on the fallback regions when the dedicated region has none', async () => {
    const qb = createQueryBuilder([])
    const runnerRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createRunner({ id: 'us-runner', region: 'us', availabilityScore: 80 })]),
    }
    const regionRoutingService = {
      hasFallbackRegion: jest.fn((region: string) => region === 'RL01'),
      getFallbackRegions: jest.fn().mockReturnValue(['us']),
    }
    const { service } = createService(qb, { runnerRepository, regionRoutingService })

    const runners = await service.findAvailableRunners({
      regions: ['RL01'],
      sandboxClass: SandboxClass.CONTAINER,
      gpu: 0,
      gpuType: null,
    })

    expect(regionRoutingService.hasFallbackRegion).toHaveBeenCalledWith('RL01')
    expect(regionRoutingService.getFallbackRegions).toHaveBeenCalledWith(['RL01'])
    expect(runnerRepository.find).toHaveBeenCalledTimes(2)
    expect(runners.map((runner) => runner.id)).toEqual(['us-runner'])
  })

  it('does not recurse into fallbacks when the dedicated region has no fallback configured', async () => {
    const qb = createQueryBuilder([])
    const runnerRepository = {
      find: jest.fn().mockResolvedValue([]),
    }
    const regionRoutingService = {
      hasFallbackRegion: jest.fn().mockReturnValue(false),
      getFallbackRegions: jest.fn(),
    }
    const { service } = createService(qb, { runnerRepository, regionRoutingService })

    const runners = await service.findAvailableRunners({
      regions: ['RL01'],
      sandboxClass: SandboxClass.CONTAINER,
      gpu: 0,
      gpuType: null,
    })

    expect(runners).toEqual([])
    expect(runnerRepository.find).toHaveBeenCalledTimes(1)
    expect(regionRoutingService.getFallbackRegions).not.toHaveBeenCalled()
  })
})
