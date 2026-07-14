export class OrganizationInvitationCreatedEvent {
  constructor(
    public readonly organizationName: string,
    public readonly invitedBy: string,
    public readonly inviteeEmail: string,
    public readonly invitationId: string,
    public readonly expiresAt: Date,
  ) {}
}
