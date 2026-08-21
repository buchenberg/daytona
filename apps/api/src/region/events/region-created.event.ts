import { EntityManager } from 'typeorm'
import { Region } from '../entities/region.entity'

export class RegionCreatedEvent {
  constructor(
    public readonly entityManager: EntityManager,
    public readonly region: Region,
    public readonly organizationId: string | null,
    public readonly snapshotManagerUsername?: string,
    public readonly snapshotManagerPassword?: string,
  ) {}
}
