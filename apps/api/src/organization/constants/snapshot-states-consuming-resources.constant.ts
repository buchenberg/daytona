import { SnapshotState } from '../../sandbox/enums/snapshot-state.enum'

export const SNAPSHOT_STATES_CONSUMING_RESOURCES: SnapshotState[] = [
  SnapshotState.BUILDING,
  SnapshotState.PENDING,
  SnapshotState.PULLING,
  SnapshotState.SNAPSHOTTING,
  SnapshotState.ACTIVE,
]
