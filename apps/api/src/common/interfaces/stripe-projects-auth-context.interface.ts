import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface StripeProjectsAuthContext extends BaseAuthContext {
  role: 'stripe-projects'
}

export function isStripeProjectsAuthContext(user: unknown): user is StripeProjectsAuthContext {
  return isBaseAuthContext(user) && user.role === 'stripe-projects'
}
