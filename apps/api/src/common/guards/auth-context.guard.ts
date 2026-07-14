import { CanActivate, ExecutionContext } from '@nestjs/common'

/**
 * Base class for guards that validate that the current request is authenticated with a specific auth context type.
 */
export abstract class AuthContextGuard implements CanActivate {
  abstract canActivate(context: ExecutionContext): Promise<boolean>
}
