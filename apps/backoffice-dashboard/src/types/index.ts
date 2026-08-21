// ============================================================================
// RE-EXPORT EVERYTHING FROM GENERATED API CLIENT
// ============================================================================
// This dashboard has ZERO manual type definitions for entities or updates.
// Everything comes from the generated backoffice-api-client.
// If apps/api changes → regenerate client → dashboard breaks at compile time ✅

// Import individual entity response DTOs with aliases for convenience
import type {
  SandboxResponseDto,
  RunnerResponseDto,
  SnapshotResponseDto,
  OrganizationResponseDto,
  OrganizationUserResponseDto,
  RegionQuotaResponseDto,
  UserResponseDto,
} from '@daytonaio/backoffice-api-client'

// Export as convenient type aliases (so code can use "Sandbox" instead of "SandboxResponseDto")
export type Sandbox = SandboxResponseDto
export type Runner = RunnerResponseDto
export type Snapshot = SnapshotResponseDto
export type Organization = OrganizationResponseDto
export type OrganizationUser = OrganizationUserResponseDto
export type RegionQuota = RegionQuotaResponseDto
export type User = UserResponseDto

// Re-export all other DTOs directly
export type {
  // Individual entity response DTOs (also available via type aliases above)
  SandboxResponseDto,
  RunnerResponseDto,
  SnapshotResponseDto,
  OrganizationResponseDto,
  OrganizationUserResponseDto,
  RegionQuotaResponseDto,
  // Update DTOs
  UpdateSandboxDto,
  UpdateRunnerDto,
  UpdateSnapshotDto,
  UpdateOrganizationDto,
  UpdateOrganizationUserDto,
  UpdateRegionQuotaDto,
  // Patch DTOs (updates + preconditions for optimistic concurrency)
  PatchSandboxDto,
  PatchRunnerDto,
  PatchSnapshotDto,
  PatchOrganizationDto,
  PatchOrganizationUserDto,
  PatchRegionQuotaDto,
  // Search response DTOs
  SandboxSearchResponseDto,
  SandboxSearchDataDto,
  RunnerSearchResponseDto,
  RunnerSearchDataDto,
  SnapshotSearchResponseDto,
  SnapshotSearchDataDto,
  OrganizationSearchResponseDto,
  OrganizationSearchDataDto,
  OrganizationUserSearchResponseDto,
  OrganizationUserSearchDataDto,
  RegionQuotaSearchResponseDto,
  RegionQuotaSearchDataDto,
  // Search request DTOs
  SearchOrganizationDto,
  // Filter DTOs (now properly exported from generated client)
  SandboxFiltersDto,
  RunnerFiltersDto,
  SnapshotFiltersDto,
  OrganizationFiltersDto,
  OrganizationUserFiltersDto,
  RegionQuotaFiltersDto,
  // Common DTOs
  PaginationDto,
  PaginationResponseDto,
  SortDto,
  // Bulk operation DTOs
  BulkUpdateSandboxDto,
  BulkUpdateRunnerDto,
  BulkUpdateSnapshotDto,
  BulkUpdateOrganizationDto,
  BulkUpdateOrganizationUserDto,
  BulkUpdateRegionQuotaDto,
  BulkUpdateResponseDto,
  BulkUpdateResultDto,
  // Bulk insert DTOs (runners)
  BulkInsertRunnerDto,
  BulkInsertResponseDto,
  BulkInsertResultDto,
  CreateRunnerDto,
} from '@daytonaio/backoffice-api-client'

// Enums from Update/Create DTOs (these are actually exported, unlike the base entity DTOs)
export {
  UpdateSandboxDtoStateEnum as SandboxState,
  UpdateSandboxDtoDesiredStateEnum as SandboxDesiredState,
  UpdateSandboxDtoBackupStateEnum as BackupState,
  CreateRunnerDtoStateEnum as RunnerState,
  SnapshotResponseDtoStateEnum as SnapshotState,
  UpdateOrganizationUserDtoRoleEnum as OrganizationMemberRole,
} from '@daytonaio/backoffice-api-client'

// Sandbox sync inspector — aliased to generated client types
import type {
  SandboxSyncStatusResponseDto,
  SandboxResyncResponseDto,
  SandboxSyncDiffEntryDto,
  SandboxSyncDiffEntryDtoFieldEnum,
  SandboxSyncDiffEntryDtoStatusEnum,
} from '@daytonaio/backoffice-api-client'

export type SandboxSyncStatusResponse = SandboxSyncStatusResponseDto
export type SandboxResyncResponse = SandboxResyncResponseDto
export type SandboxSyncDiffEntry = SandboxSyncDiffEntryDto
export type SandboxSyncDiffField = SandboxSyncDiffEntryDtoFieldEnum
export type SandboxSyncDiffStatus = SandboxSyncDiffEntryDtoStatusEnum

// ============================================================================
// BACKOFFICE-SPECIFIC TYPES (not in generated client)
// ============================================================================
// These are frontend-only types for UI state management

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  pagination?: PaginationInfo
}

export interface PaginationInfo {
  current: number // Used by Ant Design Table
  page: number
  pageSize: number
  total: number
  totalPages: number
}
