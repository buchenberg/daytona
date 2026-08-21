import { BaseAuthContext } from '../../common/interfaces/base-auth-context.interface'
import { isProxyAuthContext } from '../../common/interfaces/proxy-auth-context.interface'
import { isRegionProxyAuthContext } from '../../common/interfaces/region-proxy-auth-context.interface'
import { isSshGatewayAuthContext } from '../../common/interfaces/ssh-gateway-auth-context.interface'
import { isRegionSSHGatewayAuthContext } from '../../common/interfaces/region-ssh-gateway-auth-context.interface'

/**
 * Every value that may be written to `sandbox_last_activity.lastActivitySource`.
 */
const SANDBOX_ACTIVITY_SOURCE_VALUES = [
  'lifecycle',
  'proxy',
  'proxy.preview',
  'proxy.toolbox',
  'ssh',
  'ssh.connection',
  'ssh.keepalive',
  'api',
] as const

const SANDBOX_ACTIVITY_SOURCE_VALUES_SET = new Set<string>(SANDBOX_ACTIVITY_SOURCE_VALUES)

/**
 * The type of values that may be written to `sandbox_last_activity.lastActivitySource`.
 */
export type SandboxActivitySource = (typeof SANDBOX_ACTIVITY_SOURCE_VALUES)[number]

/**
 * Parses an untrusted string (e.g. a value read back from the Redis buffer) into a `SandboxActivitySource`.
 */
export function isSandboxActivitySource(value: string): value is SandboxActivitySource {
  return SANDBOX_ACTIVITY_SOURCE_VALUES_SET.has(value)
}

/**
 * Derives the sandbox activity source from the authenticated context.
 *
 * The prefix is owned by the server (mapped from the authenticated role and never client-settable).
 * `activityType` is an untrusted, optional refinement honored only for first-party proxy/ssh roles and
 * only when it is a known value; anything else falls back to the bare prefix, so a caller can
 * neither spoof the prefix nor inject an arbitrary value.
 */
export function deriveSandboxActivitySource(
  authContext: BaseAuthContext,
  activityType?: string,
): SandboxActivitySource {
  if (isProxyAuthContext(authContext) || isRegionProxyAuthContext(authContext)) {
    if (activityType === 'toolbox') return 'proxy.toolbox'
    if (activityType === 'preview') return 'proxy.preview'
    return 'proxy'
  }
  if (isSshGatewayAuthContext(authContext) || isRegionSSHGatewayAuthContext(authContext)) {
    if (activityType === 'connection') return 'ssh.connection'
    if (activityType === 'keepalive') return 'ssh.keepalive'
    return 'ssh'
  }
  return 'api'
}
