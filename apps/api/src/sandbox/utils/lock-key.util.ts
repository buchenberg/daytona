export function getStateChangeLockKey(id: string): string {
  return `sandbox:${id}:state-change`
}
