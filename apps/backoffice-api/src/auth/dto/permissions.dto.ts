import { ApiProperty } from '@nestjs/swagger'
import {
  ACTIONS_BY_RESOURCE,
  Permissions,
  SandboxAction,
  SnapshotAction,
  RunnerAction,
  OrganizationAction,
  OrganizationUserAction,
  RegionQuotaAction,
  UserAction,
  AuditLogAction,
  MaliDatasource,
} from '../../common/permissions'

/**
 * OpenAPI-visible shape of the permissions JSONB stored on backoffice_user.
 * Regenerating the client from this DTO produces the TypeScript type the
 * dashboard imports from `@daytonaio/backoffice-api-client`.
 *
 * Enum lists derive from `ACTIONS_BY_RESOURCE` so the runtime allow-list and
 * the OpenAPI schema can't drift.
 */
export class PermissionsDto implements Permissions {
  @ApiProperty({ required: false, description: 'Bypasses all permission checks.' })
  superAdmin?: boolean

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.sandboxes, isArray: true })
  sandboxes?: SandboxAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.snapshots, isArray: true })
  snapshots?: SnapshotAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.runners, isArray: true })
  runners?: RunnerAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.organizations, isArray: true })
  organizations?: OrganizationAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.organizationUsers, isArray: true })
  organizationUsers?: OrganizationUserAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.regionQuotas, isArray: true })
  regionQuotas?: RegionQuotaAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.users, isArray: true })
  users?: UserAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.auditLogs, isArray: true })
  auditLogs?: AuditLogAction[]

  @ApiProperty({ required: false, enum: ACTIONS_BY_RESOURCE.maliDatasources, isArray: true })
  maliDatasources?: MaliDatasource[]
}
