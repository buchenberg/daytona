import { SandboxClass } from '../../sandbox/enums/sandbox-class.enum'
import { SandboxState } from '../../sandbox/enums/sandbox-state.enum'
import { isVmSandboxClass } from '../../sandbox/utils/sandbox-class.util'
import { SANDBOX_STATES_CONSUMING_COMPUTE } from './sandbox-states-consuming-compute.constant'

export const SANDBOX_STATES_CONSUMING_DISK: SandboxState[] = [
  ...SANDBOX_STATES_CONSUMING_COMPUTE,
  SandboxState.STOPPED,
  SandboxState.PAUSED,
  SandboxState.ARCHIVING,
  SandboxState.RESIZING,
  SandboxState.SNAPSHOTTING,
]

/**
 * Disk-consuming states for VM-backed classes (linux-vm, windows).
 *
 * Unlike containers, a resting VM (stopped / paused / archiving) is backed up and evicted from its
 * runner when disk fills up, so it holds no durable runner slot - it behaves like an archived sandbox
 * and must not count toward the disk quota. We therefore drop STOPPED, PAUSED and ARCHIVING from the
 * container set, leaving only the states where the VM is actually live on a runner.
 */
export const VM_SANDBOX_STATES_CONSUMING_DISK: SandboxState[] = [
  ...SANDBOX_STATES_CONSUMING_COMPUTE,
  SandboxState.RESIZING,
  SandboxState.SNAPSHOTTING,
]

/**
 * @returns the set of states that count toward the disk quota for the given sandbox class.
 * VM-backed classes exclude the resting states (see VM_SANDBOX_STATES_CONSUMING_DISK).
 */
export function getSandboxStatesConsumingDisk(sandboxClass: SandboxClass): SandboxState[] {
  return isVmSandboxClass(sandboxClass) ? VM_SANDBOX_STATES_CONSUMING_DISK : SANDBOX_STATES_CONSUMING_DISK
}

/**
 * @returns true if a sandbox of the given class in the given state counts toward the disk quota.
 */
export function sandboxStateConsumesDisk(sandboxClass: SandboxClass, state: SandboxState): boolean {
  return getSandboxStatesConsumingDisk(sandboxClass).includes(state)
}
