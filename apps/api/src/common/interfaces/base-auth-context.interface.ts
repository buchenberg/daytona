import { SystemRole } from '../../user/enums/system-role.enum'
export interface BaseAuthContext {
  role:
    | SystemRole
    | 'proxy'
    | 'runner'
    | 'ssh-gateway'
    | 'region-proxy'
    | 'region-ssh-gateway'
    | 'sandbox'
    | 'sandbox-secrets'
    | 'otel-collector'
    | 'health-check'
    | 'billing'
    | 'runner-cleanup-tool'
    | 'user-management'
    | 'stripe-projects'
}

export function isBaseAuthContext(user: unknown): user is BaseAuthContext {
  return typeof user === 'object' && user !== null && 'role' in user
}
