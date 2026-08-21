import { ForbiddenException } from '@nestjs/common'

export class InvalidAuthenticationContextException extends ForbiddenException {
  constructor() {
    super('Invalid authentication context')
  }
}
