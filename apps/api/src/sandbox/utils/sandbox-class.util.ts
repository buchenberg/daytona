import { SandboxClass } from '../enums/sandbox-class.enum'

/**
 * Temporary utility function to allow Android snapshots/sandboxes on Container runners
 */
export function getRunnerSandboxClass(sandboxClass: SandboxClass): SandboxClass {
  if (sandboxClass !== SandboxClass.ANDROID) {
    return sandboxClass
  }

  return SandboxClass.CONTAINER
}

/**
 * Returns true when snapshots of this class are stored as Docker/OCI references in a registry
 * (and therefore go through `parseDockerImage` / `findInternalRegistryBySnapshotRef` / runner Docker pulls).
 *
 * Returns false for classes whose `snapshot.ref` is NOT a registry reference — currently only
 * `WINDOWS`, where `snapshot.ref` is an S3 object key pointing at a VHD blob. Callers that
 * extract a registry from `snapshot.ref`, propagate via Docker pull, or otherwise treat the
 * ref as an OCI name MUST short-circuit for non-registry-based classes.
 */
export function isRegistryBasedSandboxClass(sandboxClass: SandboxClass): boolean {
  return sandboxClass !== SandboxClass.WINDOWS
}

/**
 * VM-backed sandbox classes (as opposed to container-backed). They differ from containers in several
 * ways handled across the codebase: their archive state is hidden from users and surfaced as
 * stopped/paused, their archival is system-managed (runner eviction), and their backups are managed by
 * the runner itself - the API does not hand them a registry/image/tag ref, only a sandbox-id + timestamp.
 */
export const VM_SANDBOX_CLASSES: ReadonlySet<SandboxClass> = new Set([SandboxClass.LINUX_VM, SandboxClass.WINDOWS])

/**
 * @returns true if the sandbox class is VM-backed (linux-vm, windows).
 */
export function isVmSandboxClass(sandboxClass?: SandboxClass | null): boolean {
  return !!sandboxClass && VM_SANDBOX_CLASSES.has(sandboxClass)
}
