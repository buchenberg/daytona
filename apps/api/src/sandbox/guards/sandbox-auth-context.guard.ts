import { Injectable, ExecutionContext } from '@nestjs/common'
import { AuthContextGuard } from '../../common/guards/auth-context.guard'
import { isSandboxAuthContext } from '../../common/interfaces/sandbox-auth-context.interface'
import { getAuthContext } from '../../common/utils/get-auth-context'

@Injectable()
export class SandboxAuthContextGuard extends AuthContextGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    getAuthContext(context, isSandboxAuthContext)
    return true
  }
}
