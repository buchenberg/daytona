import { SandboxStartAction } from './sandbox-start.action'
import { SYNC_AGAIN } from './sandbox.action'
import { Sandbox } from '../../entities/sandbox.entity'
import { GpuType } from '../../enums/gpu-type.enum'
import { RunnerState } from '../../enums/runner-state.enum'
import { SandboxClass } from '../../enums/sandbox-class.enum'
import { SnapshotRunnerState } from '../../enums/snapshot-runner-state.enum'

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
    }
    const redisLockProvider = {
      waitForLock: jest.fn().mockResolvedValue(undefined),
      unlock: jest.fn().mockResolvedValue(undefined),
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
    )

    return { action, runnerService, snapshotService, redisLockProvider }
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
})
