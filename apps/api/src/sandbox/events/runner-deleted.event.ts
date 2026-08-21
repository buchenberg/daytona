import { EntityManager } from 'typeorm/entity-manager/EntityManager.js'

export class RunnerDeletedEvent {
  constructor(
    public readonly entityManager: EntityManager,
    public readonly runnerId: string,
  ) {}
}
