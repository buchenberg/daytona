import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { SandboxResyncResponseDto } from '../dto/sandbox-resync-response.dto'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class SandboxResyncService {
  private readonly logger = new Logger(SandboxResyncService.name)

  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepository: Repository<Sandbox>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async forceResyncForSandbox(sandboxId: string): Promise<SandboxResyncResponseDto> {
    const sandbox = await this.sandboxRepository.findOne({
      where: { id: sandboxId },
      select: ['id', 'organizationId'],
    })

    if (!sandbox) {
      throw new NotFoundException(`Sandbox ${sandboxId} not found`)
    }

    const organizationId = sandbox.organizationId

    if (!UUID_REGEX.test(organizationId)) {
      this.logger.error(`Sandbox ${sandboxId} has a non-UUID organizationId: ${organizationId}`)
      throw new InternalServerErrorException('Invalid organization id')
    }

    const signalData = JSON.stringify({
      'data-collections': ['public.sandbox'],
      type: 'incremental',
      'additional-conditions': [
        {
          'data-collection': 'public.sandbox',
          filter: `"organizationId" = '${organizationId}'`,
        },
      ],
    })

    try {
      await this.dataSource.query(
        `INSERT INTO public.debezium_signal (id, type, data) VALUES (gen_random_uuid()::text, 'execute-snapshot', $1::text)`,
        [signalData],
      )
    } catch (err) {
      this.logger.error(
        `Failed to insert debezium_signal for sandbox ${sandboxId} / org ${organizationId}: ${err instanceof Error ? err.message : String(err)}`,
      )
      throw new InternalServerErrorException('Failed to enqueue resync signal')
    }

    return {
      acknowledged: true,
      sandboxId,
      organizationId,
      requestedAt: new Date().toISOString(),
    }
  }
}
