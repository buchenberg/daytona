import { VolumeState } from '../../sandbox/enums/volume-state.enum'

export const VOLUME_STATES_CONSUMING_RESOURCES: VolumeState[] = [
  VolumeState.CREATING,
  VolumeState.READY,
  VolumeState.PENDING_CREATE,
  VolumeState.PENDING_DELETE,
  VolumeState.DELETING,
]
