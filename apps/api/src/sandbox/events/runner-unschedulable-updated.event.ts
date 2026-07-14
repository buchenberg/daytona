import { Runner } from '../entities/runner.entity'

export class RunnerUnschedulableUpdatedEvent {
  constructor(
    public readonly runner: Runner,
    public readonly oldUnschedulable: boolean,
    public readonly newUnschedulable: boolean,
  ) {}
}
