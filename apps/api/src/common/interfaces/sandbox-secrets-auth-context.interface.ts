import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

/**
 * Auth context for a sandbox authenticating with its dedicated secrets token.
 *
 * This is deliberately separate from {@link SandboxAuthContext} (the sandbox
 * auth token): the secrets token is held only by the runner and is the *only*
 * credential allowed to resolve a sandbox's plaintext secret values. A sandbox's
 * regular auth token — which lives inside the sandbox and is used for many
 * things — cannot produce this context, so a compromised sandbox cannot dump its
 * own plaintext secrets.
 */
export interface SandboxSecretsAuthContext extends BaseAuthContext {
  role: 'sandbox-secrets'
  sandboxId: string
  organizationId: string
}

export function isSandboxSecretsAuthContext(user: unknown): user is SandboxSecretsAuthContext {
  return isBaseAuthContext(user) && user.role === 'sandbox-secrets'
}
