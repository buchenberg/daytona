import { EntityManager } from 'typeorm'
import { OrganizationResourcePermission } from '../enums/organization-resource-permission.enum'

export class OrganizationResourcePermissionsUnassignedEvent {
  constructor(
    public readonly entityManager: EntityManager,
    public readonly organizationId: string,
    public readonly userId: string,
    public readonly unassignedPermissions: OrganizationResourcePermission[],
  ) {}
}
