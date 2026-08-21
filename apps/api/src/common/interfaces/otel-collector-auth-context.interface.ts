import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface OtelCollectorAuthContext extends BaseAuthContext {
  role: 'otel-collector'
}

export function isOtelCollectorAuthContext(user: unknown): user is OtelCollectorAuthContext {
  return isBaseAuthContext(user) && user.role === 'otel-collector'
}
