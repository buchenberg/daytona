import { ConflictException } from '@nestjs/common'

export class SnapshotConflictError extends ConflictException {
  constructor() {
    super('Snapshot was modified by another operation')
  }
}
