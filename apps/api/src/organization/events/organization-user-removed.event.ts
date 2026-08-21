export class OrganizationUserRemovedEvent {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}
