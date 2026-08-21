import { EntityManager } from 'typeorm'
import { User } from '../user.entity'
import { CreateOrganizationQuotaDto } from '../../organization/dto/create-organization-quota.dto'

export class UserCreatedEvent {
  constructor(
    public readonly entityManager: EntityManager,
    public readonly user: User,
    public readonly personalOrganizationQuota?: CreateOrganizationQuotaDto,
    public readonly personalOrganizationDefaultRegionId?: string,
  ) {}
}
