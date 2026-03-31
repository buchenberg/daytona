/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  Configuration,
  OrganizationsApi,
  SandboxesApi,
  RunnersApi,
  SnapshotsApi,
  OrganizationUsersApi,
  RegionQuotasApi,
  UsersApi,
  AuditLogsApi,
  SearchSandboxDto,
  SandboxSearchResponseDto,
  SearchRunnerDto,
  RunnerSearchResponseDto,
  SearchSnapshotDto,
  SnapshotSearchResponseDto,
  SearchOrganizationDto,
  OrganizationSearchResponseDto,
  SearchOrganizationUserDto,
  OrganizationUserSearchResponseDto,
  SearchRegionQuotaDto,
  RegionQuotaSearchResponseDto,
  SearchUsersDto,
  UserSearchResponseDto,
  UserDeletionPreviewDto,
  UserDeletionRequestDto,
  UserDeletionResponseDto,
  SnapshotPropagationRequestDto,
  SnapshotPropagationResponseDto,
  SearchAuditLogsDto,
  AuditLogSearchResponseDto,
  AddToWarmPoolDto,
  InitializeWebhooksResponseDto,
  AddToWarmPoolResponseDto,
} from '@daytonaio/backoffice-api-client'
import type {
  PatchSandboxDto,
  PatchRunnerDto,
  PatchSnapshotDto,
  PatchOrganizationDto,
  PatchOrganizationUserDto,
  PatchRegionQuotaDto,
} from '@daytonaio/backoffice-api-client'
import type {
  BulkUpdateSandboxDto,
  BulkUpdateRunnerDto,
  BulkUpdateSnapshotDto,
  BulkUpdateOrganizationDto,
  BulkUpdateOrganizationUserDto,
  BulkUpdateRegionQuotaDto,
  BulkUpdateResponseDto,
  BulkInsertRunnerDto,
  BulkInsertResponseDto,
} from '@daytonaio/backoffice-api-client'
import axios from 'axios'

declare global {
  interface Window {
    APP_CONFIG?: {
      API_URL?: string
    }
  }
}

const API_URL = window.APP_CONFIG?.API_URL || '/api/v1'

export class BackofficeApiClient {
  private organizationsApi: OrganizationsApi
  private sandboxesApi: SandboxesApi
  private runnersApi: RunnersApi
  private snapshotsApi: SnapshotsApi
  private organizationUsersApi: OrganizationUsersApi
  private regionQuotasApi: RegionQuotasApi
  private usersApi: UsersApi
  private auditLogsApi: AuditLogsApi

  constructor() {
    const config = new Configuration({
      basePath: API_URL,
      baseOptions: {
        withCredentials: true, // Important: Send cookies with requests
      },
    })

    this.organizationsApi = new OrganizationsApi(config)
    this.sandboxesApi = new SandboxesApi(config)
    this.runnersApi = new RunnersApi(config)
    this.snapshotsApi = new SnapshotsApi(config)
    this.organizationUsersApi = new OrganizationUsersApi(config)
    this.regionQuotasApi = new RegionQuotasApi(config)
    this.usersApi = new UsersApi(config)
    this.auditLogsApi = new AuditLogsApi(config)

    // Redirect to login on 401 responses (token expired)
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          window.location.href = '/api/v1/auth/login'
        }
        return Promise.reject(error)
      },
    )
  }

  // No longer needed - authentication handled via HTTP-only cookies
  public setAccessToken(_token: string) {
    // Deprecated: Authentication now handled via HTTP-only session cookies
    // This method is kept for backward compatibility but does nothing
  }

  // Search methods - use generated response types
  async searchSandboxes(body: SearchSandboxDto): Promise<SandboxSearchResponseDto> {
    const response = await this.sandboxesApi.sandboxesSearchControllerSearch(body)
    return response.data as SandboxSearchResponseDto
  }

  async searchRunners(body: SearchRunnerDto): Promise<RunnerSearchResponseDto> {
    const response = await this.runnersApi.runnersSearchControllerSearch(body)
    return response.data as RunnerSearchResponseDto
  }

  async searchSnapshots(body: SearchSnapshotDto): Promise<SnapshotSearchResponseDto> {
    const response = await this.snapshotsApi.snapshotsSearchControllerSearch(body)
    return response.data as SnapshotSearchResponseDto
  }

  async searchOrganizations(body: SearchOrganizationDto): Promise<OrganizationSearchResponseDto> {
    const response = await this.organizationsApi.organizationsSearchControllerSearch(body)
    return response.data as OrganizationSearchResponseDto
  }

  async searchOrganizationUsers(body: SearchOrganizationUserDto): Promise<OrganizationUserSearchResponseDto> {
    const response = await this.organizationUsersApi.organizationUsersSearchControllerSearch(body)
    return response.data as OrganizationUserSearchResponseDto
  }

  async searchRegionQuotas(body: SearchRegionQuotaDto): Promise<RegionQuotaSearchResponseDto> {
    const response = await this.regionQuotasApi.regionQuotasSearchControllerSearch(body)
    return response.data as RegionQuotaSearchResponseDto
  }

  // Update methods - use PatchDto (updates + optional preconditions for optimistic concurrency)
  async updateSandbox(id: string, data: PatchSandboxDto): Promise<unknown> {
    const response = await this.sandboxesApi.sandboxesControllerUpdate(id, data)
    return response.data
  }

  async updateRunner(id: string, data: PatchRunnerDto): Promise<unknown> {
    const response = await this.runnersApi.runnersControllerUpdate(id, data)
    return response.data
  }

  async updateSnapshot(id: string, data: PatchSnapshotDto): Promise<unknown> {
    const response = await this.snapshotsApi.snapshotsControllerUpdate(id, data)
    return response.data
  }

  async updateOrganization(id: string, data: PatchOrganizationDto): Promise<unknown> {
    const response = await this.organizationsApi.organizationsControllerUpdate(id, data)
    return response.data
  }

  async updateOrganizationUser(
    organizationId: string,
    userId: string,
    data: PatchOrganizationUserDto,
  ): Promise<unknown> {
    const response = await this.organizationUsersApi.organizationUsersControllerUpdate(organizationId, userId, data)
    return response.data
  }

  async updateRegionQuota(organizationId: string, regionId: string, data: PatchRegionQuotaDto): Promise<unknown> {
    const response = await this.regionQuotasApi.regionQuotasControllerUpdate(organizationId, regionId, data)
    return response.data
  }

  // Bulk update methods - use generated Bulk types
  async bulkUpdateSandboxes(data: BulkUpdateSandboxDto): Promise<BulkUpdateResponseDto> {
    const response = await this.sandboxesApi.sandboxesBulkControllerBulkUpdate(data)
    return response.data as BulkUpdateResponseDto
  }

  async bulkUpdateRunners(data: BulkUpdateRunnerDto): Promise<BulkUpdateResponseDto> {
    const response = await this.runnersApi.runnersBulkControllerBulkUpdate(data)
    return response.data as BulkUpdateResponseDto
  }

  async bulkUpdateSnapshots(data: BulkUpdateSnapshotDto): Promise<BulkUpdateResponseDto> {
    const response = await this.snapshotsApi.snapshotsBulkControllerBulkUpdate(data)
    return response.data as BulkUpdateResponseDto
  }

  async bulkUpdateOrganizations(data: BulkUpdateOrganizationDto): Promise<BulkUpdateResponseDto> {
    const response = await this.organizationsApi.organizationsBulkControllerBulkUpdate(data)
    return response.data as BulkUpdateResponseDto
  }

  async bulkUpdateOrganizationUsers(data: BulkUpdateOrganizationUserDto): Promise<BulkUpdateResponseDto> {
    const response = await this.organizationUsersApi.organizationUsersBulkControllerBulkUpdate(data)
    return response.data as BulkUpdateResponseDto
  }

  async bulkUpdateRegionQuotas(data: BulkUpdateRegionQuotaDto): Promise<BulkUpdateResponseDto> {
    const response = await this.regionQuotasApi.regionQuotasBulkControllerBulkUpdate(data)
    return response.data as BulkUpdateResponseDto
  }

  async bulkInsertRunners(
    data: BulkInsertRunnerDto,
  ): Promise<{ success: boolean; data?: BulkInsertResponseDto; error?: { message: string } }> {
    try {
      const response = await this.runnersApi.runnersBulkInsertControllerBulkInsert(data)
      return { success: true, data: response.data }
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.message || error.message || 'Failed to bulk insert runners',
        },
      }
    }
  }

  // Users methods
  async searchUsers(data: SearchUsersDto): Promise<UserSearchResponseDto> {
    const response = await this.usersApi.usersSearchControllerSearch(data)
    return response.data
  }

  async previewUserDeletion(userId: string): Promise<UserDeletionPreviewDto> {
    const response = await this.usersApi.userDeletionControllerPreviewDeletion(userId)
    return response.data
  }

  async deleteUser(userId: string, request: UserDeletionRequestDto): Promise<UserDeletionResponseDto> {
    const response = await this.usersApi.userDeletionControllerDeleteUser(userId, request)
    return response.data
  }

  // Snapshot propagation method
  async propagateSnapshot(
    snapshotId: string,
    request: SnapshotPropagationRequestDto,
  ): Promise<SnapshotPropagationResponseDto> {
    const response = await this.snapshotsApi.snapshotPropagationControllerPropagate(snapshotId, request)
    return response.data
  }

  // Audit logs method
  async searchAuditLogs(body: SearchAuditLogsDto): Promise<AuditLogSearchResponseDto> {
    const response = await this.auditLogsApi.auditControllerSearch(body)
    return response.data as AuditLogSearchResponseDto
  }

  // Initialize webhooks for organization
  async initializeWebhooks(organizationId: string): Promise<InitializeWebhooksResponseDto> {
    const response = await this.organizationsApi.organizationsControllerInitializeWebhooks(organizationId)
    return response.data
  }

  // Add snapshot to warm pool
  async addToWarmPool(snapshotId: string, request: AddToWarmPoolDto): Promise<AddToWarmPoolResponseDto> {
    const response = await this.snapshotsApi.snapshotsControllerAddToWarmPool(snapshotId, request)
    return response.data
  }
}

export default new BackofficeApiClient()
