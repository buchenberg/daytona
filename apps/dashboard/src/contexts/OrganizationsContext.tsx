import { Organization } from '@daytona/api-client'
import { createContext } from 'react'

export interface IOrganizationsContext {
  organizations: Organization[]
  refreshOrganizations: (selectedOrganizationId?: string) => Promise<void>
}

export const OrganizationsContext = createContext<IOrganizationsContext | undefined>(undefined)
