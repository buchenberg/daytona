import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RunnerEvent, RunnerEventType } from '../../backoffice-db/entities/runner-event.entity'

export interface RunnerEventEntry {
  runnerName: string | null
  type: RunnerEventType
  message: string
  actor: string
  requestId?: string | null
}

@Injectable()
export class RunnerEventsService {
  constructor(
    @InjectRepository(RunnerEvent, 'backoffice')
    private readonly events: Repository<RunnerEvent>,
  ) {}

  async record(entry: RunnerEventEntry): Promise<RunnerEvent> {
    return this.events.save(this.events.create({ requestId: null, ...entry }))
  }

  async recordMany(entries: RunnerEventEntry[]): Promise<void> {
    if (entries.length === 0) return
    await this.events.save(entries.map((entry) => this.events.create({ requestId: null, ...entry })))
  }

  async forRunner(runnerName: string, limit = 100): Promise<RunnerEvent[]> {
    return this.events.find({ where: { runnerName }, order: { createdAt: 'DESC' }, take: limit })
  }

  async forRequest(requestId: string): Promise<RunnerEvent[]> {
    return this.events.find({ where: { requestId }, order: { createdAt: 'ASC' } })
  }
}
