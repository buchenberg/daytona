import { Runner } from '../entities/runner.entity'

export class RunnerCreatedEvent {
  constructor(public readonly runner: Runner) {}
}
