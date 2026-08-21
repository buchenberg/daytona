import { ConflictException } from '@nestjs/common'

export class SandboxConflictError extends ConflictException {
  constructor() {
    super('Sandbox was modified by another operation')
  }
}
