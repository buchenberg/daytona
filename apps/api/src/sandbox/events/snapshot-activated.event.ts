import { Snapshot } from '../entities/snapshot.entity'

export class SnapshotActivatedEvent {
  constructor(public readonly snapshot: Snapshot) {}
}
