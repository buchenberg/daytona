import { OrganizationResourcePermission } from '../../organization/enums/organization-resource-permission.enum'

export const STRIPE_PROJECTS_API_KEY_PERMISSIONS: OrganizationResourcePermission[] = [
  OrganizationResourcePermission.WRITE_SANDBOXES,
  OrganizationResourcePermission.DELETE_SANDBOXES,
  OrganizationResourcePermission.WRITE_SNAPSHOTS,
  OrganizationResourcePermission.DELETE_SNAPSHOTS,
  OrganizationResourcePermission.READ_VOLUMES,
  OrganizationResourcePermission.WRITE_VOLUMES,
  OrganizationResourcePermission.DELETE_VOLUMES,
  OrganizationResourcePermission.WRITE_REGISTRIES,
  OrganizationResourcePermission.DELETE_REGISTRIES,
]
