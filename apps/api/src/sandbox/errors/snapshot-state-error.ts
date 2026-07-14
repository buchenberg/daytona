export class SnapshotStateError extends Error {
  constructor(public readonly errorReason: string) {
    super(errorReason)
    this.name = 'SnapshotStateError'
  }
}
