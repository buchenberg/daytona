import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface BillingAuthContext extends BaseAuthContext {
  role: 'billing'
}

export function isBillingAuthContext(user: unknown): user is BillingAuthContext {
  return isBaseAuthContext(user) && user.role === 'billing'
}
