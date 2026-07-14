import { Sandbox } from '../entities/sandbox.entity'

export class SandboxStoppedEvent {
  constructor(
    public readonly sandbox: Sandbox,
    public readonly force?: boolean,
  ) {}
}
