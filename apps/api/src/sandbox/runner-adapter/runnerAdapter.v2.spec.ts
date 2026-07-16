import { RunnerAdapterV2 } from './runnerAdapter.v2'
import { JobType } from '../enums/job-type.enum'
import { ResourceType } from '../enums/resource-type.enum'

describe('RunnerAdapterV2', () => {
  function createAdapter() {
    const jobService = { createJob: jest.fn().mockResolvedValue(undefined) }
    const adapter = new RunnerAdapterV2({} as never, {} as never, jobService as never)
    return { adapter, jobService }
  }

  function createSandbox(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sandbox-1',
      name: 'sandbox-1',
      organizationId: 'org-1',
      osUser: 'daytona',
      cpu: 1,
      gpu: 0,
      mem: 1,
      disk: 3,
      env: {},
      volumes: [],
      networkBlockAll: false,
      networkAllowList: undefined,
      domainAllowList: undefined,
      authToken: 'token',
      secretsToken: null,
      region: 'us',
      linkedSandboxId: null,
      sandboxClass: 'small',
      autoDeleteInterval: -1,
      ...overrides,
    }
  }

  async function getCreateSandboxPayload(sandbox: Record<string, unknown>) {
    const { adapter, jobService } = createAdapter()
    await adapter.init({ id: 'runner-1' } as never)
    await adapter.createSandbox(sandbox as never, 'snapshot-ref')

    expect(jobService.createJob).toHaveBeenCalledTimes(1)
    const call = jobService.createJob.mock.calls[0]
    expect(call[1]).toBe(JobType.CREATE_SANDBOX)
    expect(call[3]).toBe(ResourceType.SANDBOX)
    return call[5]
  }

  it('sets ephemeral=true when autoDeleteInterval is 0', async () => {
    const payload = await getCreateSandboxPayload(createSandbox({ autoDeleteInterval: 0 }))
    expect(payload.ephemeral).toBe(true)
  })

  it('sets ephemeral=false when autoDeleteInterval is -1 (disabled)', async () => {
    const payload = await getCreateSandboxPayload(createSandbox({ autoDeleteInterval: -1 }))
    expect(payload.ephemeral).toBe(false)
  })

  it('sets ephemeral=false when autoDeleteInterval is a positive value', async () => {
    const payload = await getCreateSandboxPayload(createSandbox({ autoDeleteInterval: 30 }))
    expect(payload.ephemeral).toBe(false)
  })
})
