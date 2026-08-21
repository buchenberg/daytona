export function isEphemeral(sandbox: { autoDeleteInterval?: number }): boolean {
  return sandbox.autoDeleteInterval === 0
}
