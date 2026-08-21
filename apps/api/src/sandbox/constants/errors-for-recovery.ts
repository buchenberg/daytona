// Substrings in an error message that should trigger an automatic restore
export const RECOVERY_ERROR_SUBSTRINGS: string[] = ['timeout waiting for daemon to start', 'sysbox']

export const SPILLOVER_ERROR_SUBSTRINGS: string[] = ['failed to add any hypervisor device to devices cgroup']

export function isSpilloverError(errorReason: string | null | undefined): boolean {
  if (!errorReason) {
    return false
  }
  const lower = errorReason.toLowerCase()
  return SPILLOVER_ERROR_SUBSTRINGS.some((s) => lower.includes(s.toLowerCase()))
}

// Substrings that indicate the API should recover by archiving and restoring from backup
// rather than delegating to the runner for an in-place fix.
const API_RECOVERABLE_SUBSTRINGS: string[] = [
  'timeout while creating',
  'timeout while starting',
  'timeout while pulling',
  'job timed out',
]

export function isApiRecoverableError(errorReason: string | null | undefined): boolean {
  if (!errorReason) {
    return false
  }
  const lower = errorReason.toLowerCase()
  return API_RECOVERABLE_SUBSTRINGS.some((s) => lower.includes(s))
}
