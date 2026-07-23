import { SandboxStartAction } from './sandbox-start.action'
import { SYNC_AGAIN } from './sandbox.action'
import { Sandbox } from '../../entities/sandbox.entity'
import { GpuType } from '../../enums/gpu-type.enum'
import { RunnerState } from '../../enums/runner-state.enum'
import { SandboxClass } from '../../enums/sandbox-class.enum'
import { SandboxState } from '../../enums/sandbox-state.enum'
import { SnapshotRunnerState } from '../../enums/snapshot-runner-state.enum'
import { RL01_REGION } from '../../constants/dedicated-regions.constant'

describe('SandboxStartAction', () => {
  function createAction() {
    const runnerService = {
      getRandomAvailableRunner: jest.fn(),
      getSnapshotRunners: jest.fn(),
      findOneOrFail: jest.fn(),
      getReservedGpuUnitsByRunnerId: jest.fn(),
      getRunnerFreeGpuUnits: jest.fn((runner: any, reserved: Map<string, number>) =>
        runner.gpu === -1 ? Number.POSITIVE_INFINITY : Math.max(0, (runner.gpu ?? 0) - (reserved.get(runner.id) ?? 0)),
      ),
      getRunnersWithMultipleSnapshotsPulling: jest.fn(),
      createSnapshotRunnerEntry: jest.fn(),
    }
    const snapshotService = {
      getSnapshotByName: jest.fn(),
    }
    const configService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    }
    const redis = {
      get: jest.fn(),
      setex: jest.fn().mockResolvedValue('OK'),
    }
    const redisLockProvider = {
      waitForLock: jest.fn().mockResolvedValue(undefined),
      unlock: jest.fn().mockResolvedValue(undefined),
    }
    const regionRoutingService = {
      resolveEffectiveRegion: jest.fn().mockReturnValue('us'),
      hasFallbackRegion: jest.fn().mockReturnValue(false),
      getFallbackRegion: jest.fn().mockReturnValue(null),
      isSpilloverOnErrorRegion: jest.fn().mockReturnValue(false),
    }

    const action = new SandboxStartAction(
      runnerService as never,
      {} as never,
      {} as never,
      snapshotService as never,
      {} as never,
      {} as never,
      configService as never,
      redisLockProvider as never,
      redis as never,
      {} as never,
      regionRoutingService as never,
    )

    return { action, runnerService, snapshotService, redisLockProvider, redis, regionRoutingService }
  }

  it('assigns GPU sandboxes without retry exclusions', async () => {
    const { action, runnerService, snapshotService } = createAction()
    const updateSandboxState = jest.spyOn(action as any, 'updateSandboxState').mockResolvedValue(undefined)
    jest.spyOn(action as any, 'pullSnapshotToRunner').mockResolvedValue(undefined)

    snapshotService.getSnapshotByName.mockResolvedValue({
      ref: 'snapshot-ref',
      sandboxClass: SandboxClass.CONTAINER,
      disk: 3,
    })
    runnerService.getSnapshotRunners.mockResolvedValue([
      { runnerId: 'runner-snapshot', state: SnapshotRunnerState.PULLING_SNAPSHOT },
    ])
    runnerService.findOneOrFail.mockResolvedValue({
      id: 'runner-snapshot',
      region: 'us',
      state: RunnerState.READY,
      sandboxClass: SandboxClass.CONTAINER,
      gpu: 8,
      gpuType: GpuType.H100,
    })
    runnerService.getReservedGpuUnitsByRunnerId.mockResolvedValue(new Map([['runner-snapshot', 7]]))
    runnerService.getRunnersWithMultipleSnapshotsPulling.mockResolvedValue(['runner-pulling'])
    runnerService.getRandomAvailableRunner
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'runner-c', region: 'us', gpuType: GpuType.H100 })

    const result = await (action as any).handleUnassignedRunnerSandbox(
      Object.assign(new Sandbox(), {
        id: 'sandbox-1',
        organizationId: 'org-1',
        snapshot: 'snapshot-name',
        sandboxClass: SandboxClass.CONTAINER,
        region: 'us',
        cpu: 16,
        mem: 192,
        disk: 512,
        gpu: 2,
        gpuType: GpuType.H100,
        prevRunnerId: 'runner-prev',
      }),
      {},
    )

    expect(result).toBe(SYNC_AGAIN)
    expect(runnerService.getReservedGpuUnitsByRunnerId).toHaveBeenCalledWith(['runner-snapshot'])
    expect(runnerService.getRandomAvailableRunner.mock.calls[0][0].excludedRunnerIds).toBeUndefined()
    expect(runnerService.getRandomAvailableRunner.mock.calls[1][0].excludedRunnerIds).toEqual(['runner-pulling'])
    expect(updateSandboxState).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sandbox-1' }),
      expect.any(String),
      {},
      'runner-c',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    )
  })

  describe('resolveRegionWithSpillover', () => {
    it('returns the effective region when it has no fallback', async () => {
      const { action, regionRoutingService, redis } = createAction()
      regionRoutingService.resolveEffectiveRegion.mockReturnValue(RL01_REGION)
      regionRoutingService.hasFallbackRegion.mockReturnValue(false)

      const region = await (action as any).resolveRegionWithSpillover(
        Object.assign(new Sandbox(), {
          id: 'sandbox-1',
          organizationId: 'org-1',
          region: 'us',
          cpu: 2,
          mem: 4,
          disk: 4,
          gpu: 0,
        }),
      )

      expect(region).toBe(RL01_REGION)
      expect(redis.get).not.toHaveBeenCalled()
    })

    it('returns the effective region when no force-spillover hint is set', async () => {
      const { action, regionRoutingService, redis } = createAction()
      regionRoutingService.resolveEffectiveRegion.mockReturnValue(RL01_REGION)
      regionRoutingService.hasFallbackRegion.mockReturnValue(true)
      redis.get.mockResolvedValue(null)

      const region = await (action as any).resolveRegionWithSpillover(
        Object.assign(new Sandbox(), {
          id: 'sandbox-1',
          organizationId: 'org-1',
          region: 'us',
          cpu: 2,
          mem: 4,
          disk: 4,
          gpu: 0,
        }),
      )

      expect(region).toBe(RL01_REGION)
      expect(redis.get).toHaveBeenCalledWith('sandbox-sandbox-1-force-spillover-region')
      expect(regionRoutingService.getFallbackRegion).not.toHaveBeenCalled()
    })

    it('returns the fallback region when a force-spillover hint is set', async () => {
      const { action, regionRoutingService, redis } = createAction()
      regionRoutingService.resolveEffectiveRegion.mockReturnValue(RL01_REGION)
      regionRoutingService.hasFallbackRegion.mockReturnValue(true)
      regionRoutingService.getFallbackRegion.mockReturnValue('us')
      redis.get.mockResolvedValue('1')

      const region = await (action as any).resolveRegionWithSpillover(
        Object.assign(new Sandbox(), {
          id: 'sandbox-1',
          organizationId: 'org-1',
          region: 'us',
          cpu: 2,
          mem: 4,
          disk: 4,
          gpu: 0,
        }),
      )

      expect(region).toBe('us')
      expect(regionRoutingService.getFallbackRegion).toHaveBeenCalledWith(RL01_REGION)
    })

    it('falls back to the effective region if the fallback mapping disappears', async () => {
      const { action, regionRoutingService, redis } = createAction()
      regionRoutingService.resolveEffectiveRegion.mockReturnValue(RL01_REGION)
      regionRoutingService.hasFallbackRegion.mockReturnValue(true)
      regionRoutingService.getFallbackRegion.mockReturnValue(null)
      redis.get.mockResolvedValue('1')

      const region = await (action as any).resolveRegionWithSpillover(
        Object.assign(new Sandbox(), {
          id: 'sandbox-2',
          organizationId: 'org-1',
          region: 'us',
          cpu: 2,
          mem: 4,
          disk: 4,
          gpu: 0,
        }),
      )

      expect(region).toBe(RL01_REGION)
    })
  })

  describe('trySpilloverOnRunnerError', () => {
    const spilloverError = {
      message: 'failed to add any hypervisor device to devices cgroup',
    }

    function sandboxAndRunner() {
      return {
        sandbox: Object.assign(new Sandbox(), {
          id: 'sandbox-1',
          organizationId: 'any-org',
          region: 'us',
          buildInfo: null,
        }),
        runner: {
          id: 'runner-dedicated',
          region: RL01_REGION,
        },
      }
    }

    it('returns false for non-spillover errors', async () => {
      const { action, regionRoutingService, redis } = createAction()
      const { sandbox, runner } = sandboxAndRunner()

      await expect(
        (action as any).trySpilloverOnRunnerError(sandbox, runner, { message: 'disk full' }, {}),
      ).resolves.toBe(false)
      expect(regionRoutingService.isSpilloverOnErrorRegion).not.toHaveBeenCalled()
      expect(redis.setex).not.toHaveBeenCalled()
    })

    it('returns false when the runner region is not spillover-on-error', async () => {
      const { action, regionRoutingService, redis } = createAction()
      const { sandbox, runner } = sandboxAndRunner()
      regionRoutingService.isSpilloverOnErrorRegion.mockReturnValue(false)
      regionRoutingService.hasFallbackRegion.mockReturnValue(true)

      await expect((action as any).trySpilloverOnRunnerError(sandbox, runner, spilloverError, {})).resolves.toBe(false)
      expect(regionRoutingService.isSpilloverOnErrorRegion).toHaveBeenCalledWith(RL01_REGION)
      expect(redis.setex).not.toHaveBeenCalled()
    })

    it('returns false when the runner region has no fallback', async () => {
      const { action, regionRoutingService, redis } = createAction()
      const { sandbox, runner } = sandboxAndRunner()
      regionRoutingService.isSpilloverOnErrorRegion.mockReturnValue(true)
      regionRoutingService.hasFallbackRegion.mockReturnValue(false)

      await expect((action as any).trySpilloverOnRunnerError(sandbox, runner, spilloverError, {})).resolves.toBe(false)
      expect(redis.setex).not.toHaveBeenCalled()
    })

    it('forces spillover for any org when the region opts in and has a fallback', async () => {
      const { action, regionRoutingService, redis } = createAction()
      const { sandbox, runner } = sandboxAndRunner()
      regionRoutingService.isSpilloverOnErrorRegion.mockReturnValue(true)
      regionRoutingService.hasFallbackRegion.mockReturnValue(true)
      const updateSandboxState = jest.spyOn(action as any, 'updateSandboxState').mockResolvedValue(undefined)

      await expect((action as any).trySpilloverOnRunnerError(sandbox, runner, spilloverError, 'lock')).resolves.toBe(
        true,
      )

      expect(regionRoutingService.isSpilloverOnErrorRegion).toHaveBeenCalledWith(RL01_REGION)
      expect(regionRoutingService.hasFallbackRegion).toHaveBeenCalledWith(RL01_REGION)
      expect(redis.setex).toHaveBeenCalledWith('sandbox-sandbox-1-force-spillover-region', 60, '1')
      expect(updateSandboxState).toHaveBeenCalledWith(sandbox, SandboxState.PULLING_SNAPSHOT, 'lock', null)
    })

    it('reassigns build sandboxes to PENDING_BUILD on spillover', async () => {
      const { action, regionRoutingService } = createAction()
      const { sandbox, runner } = sandboxAndRunner()
      sandbox.buildInfo = { dockerfileContent: 'FROM alpine' } as never
      regionRoutingService.isSpilloverOnErrorRegion.mockReturnValue(true)
      regionRoutingService.hasFallbackRegion.mockReturnValue(true)
      const updateSandboxState = jest.spyOn(action as any, 'updateSandboxState').mockResolvedValue(undefined)

      await expect((action as any).trySpilloverOnRunnerError(sandbox, runner, spilloverError, 'lock')).resolves.toBe(
        true,
      )

      expect(updateSandboxState).toHaveBeenCalledWith(sandbox, SandboxState.PENDING_BUILD, 'lock', null)
    })
  })
})
