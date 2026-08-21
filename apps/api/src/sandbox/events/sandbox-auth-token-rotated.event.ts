import { Sandbox } from '../entities/sandbox.entity'

export class SandboxAuthTokenRotatedEvent {
  constructor(
    public readonly sandbox: Sandbox,
    public readonly previousAuthToken: string,
    public readonly newAuthToken: string,
  ) {}
}
