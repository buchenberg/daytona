export function getStateChangeLockKey(id: string): string {
  return `sandbox:${id}:state-change`
}

export const GPU_RUNNER_ASSIGNMENT_LOCK_KEY = 'gpu-runner-assignment'
