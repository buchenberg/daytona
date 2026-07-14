import { Injectable, ExecutionContext } from '@nestjs/common'
import { AuthContextGuard } from '../../common/guards/auth-context.guard'
import { isSandboxSecretsAuthContext } from '../../common/interfaces/sandbox-secrets-auth-context.interface'
import { getAuthContext } from '../../common/utils/get-auth-context'

@Injectable()
export class SandboxSecretsAuthContextGuard extends AuthContextGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    getAuthContext(context, isSandboxSecretsAuthContext)
    return true
  }
}
