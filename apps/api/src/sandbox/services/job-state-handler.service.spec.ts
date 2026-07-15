import { JobStateHandlerService } from './job-state-handler.service'
import { Job } from '../entities/job.entity'
import { JobStatus } from '../enums/job-status.enum'
import { JobType } from '../enums/job-type.enum'
import { ResourceType } from '../enums/resource-type.enum'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { SandboxState } from '../enums/sandbox-state.enum'

describe('JobStateHandlerService', () => {
  function createService() {
    const sandboxRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    }

    const service = new JobStateHandlerService(
      sandboxRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    return { service, sandboxRepository }
  }

  it('marks successful create jobs as started', async () => {
    const { service, sandboxRepository } = createService()
    const sandbox = {
      id: 'sandbox-1',
      desiredState: SandboxDesiredState.STARTED,
      runnerId: 'runner-a',
      gpu: 0,
    }
    sandboxRepository.findOne.mockResolvedValue(sandbox)

    const job = new Job({
      type: JobType.CREATE_SANDBOX,
      status: JobStatus.COMPLETED,
      runnerId: 'runner-a',
      resourceType: ResourceType.SANDBOX,
      resourceId: 'sandbox-1',
    })

    await service.handleJobCompletion(job)

    expect(sandboxRepository.update).toHaveBeenCalledWith('sandbox-1', {
      updateData: expect.objectContaining({
        state: SandboxState.STARTED,
        errorReason: null,
      }),
      entity: sandbox,
    })
  })
})
