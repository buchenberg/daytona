import { ConflictException } from '@nestjs/common'

export class JobConflictError extends ConflictException {
  constructor() {
    super('An operation is already in progress for this resource')
  }
}
