import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface RunnerCleanupToolAuthContext extends BaseAuthContext {
  role: 'runner-cleanup-tool'
}

export function isRunnerCleanupToolAuthContext(user: unknown): user is RunnerCleanupToolAuthContext {
  return isBaseAuthContext(user) && user.role === 'runner-cleanup-tool'
}
