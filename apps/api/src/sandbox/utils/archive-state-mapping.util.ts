import { SandboxClass } from '../enums/sandbox-class.enum'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'

/**
 * Sandbox classes whose archive lifecycle is managed by the system (runner eviction) rather than
 * exposed to users. Their archiving/archived state is surfaced as stopped (or paused, if the state
 * includes memory) so users never see archive states for these classes.
 *
 * Shared by all client-facing sandbox DTOs so list and detail views stay consistent.
 */
export const ARCHIVE_STATE_HIDDEN_CLASSES: ReadonlySet<SandboxClass> = new Set([
  SandboxClass.LINUX_VM,
  SandboxClass.WINDOWS,
])

/**
 * @returns true if the sandbox class's archived state is treated the same as stopped/paused - i.e. its
 * archive lifecycle is system-managed (runner eviction). For these classes the archived state is hidden
 * from users (shown as stopped/paused) and billed the same as stopped (disk usage keeps accruing).
 */
export function isArchiveStateHiddenClass(sandboxClass?: SandboxClass | null): boolean {
  return !!sandboxClass && ARCHIVE_STATE_HIDDEN_CLASSES.has(sandboxClass)
}

/**
 * Maps an internal sandbox state to the state exposed to clients. For classes whose archive state is
 * hidden, the archive lifecycle is surfaced as its stopped/paused equivalent so clients never observe it:
 * - archiving/archived -> paused (when the state includes memory) or stopped
 * - restoring (coming back from archive) -> resuming (with memory) or starting
 */
export function mapStateForClient(
  state: SandboxState,
  sandboxClass?: SandboxClass,
  includesMemory?: boolean | null,
): SandboxState {
  if (!sandboxClass || !ARCHIVE_STATE_HIDDEN_CLASSES.has(sandboxClass)) {
    return state
  }

  if (state === SandboxState.ARCHIVED || state === SandboxState.ARCHIVING) {
    return includesMemory ? SandboxState.PAUSED : SandboxState.STOPPED
  }

  if (state === SandboxState.RESTORING) {
    return includesMemory ? SandboxState.RESUMING : SandboxState.STARTING
  }

  return state
}

/**
 * Maps an internal desired state to the desired state exposed to clients. Mirrors mapStateForClient
 * for the archived desired state.
 */
export function mapDesiredStateForClient(
  desiredState: SandboxDesiredState | undefined,
  sandboxClass?: SandboxClass,
  includesMemory?: boolean | null,
): SandboxDesiredState | undefined {
  if (desiredState === SandboxDesiredState.ARCHIVED && sandboxClass && ARCHIVE_STATE_HIDDEN_CLASSES.has(sandboxClass)) {
    return includesMemory ? SandboxDesiredState.PAUSED : SandboxDesiredState.STOPPED
  }
  return desiredState
}
