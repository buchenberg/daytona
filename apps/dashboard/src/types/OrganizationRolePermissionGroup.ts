import { OrganizationRolePermissionsEnum } from '@daytona/api-client'

export interface OrganizationRolePermissionGroup {
  name: string
  permissions: OrganizationRolePermissionsEnum[]
}
