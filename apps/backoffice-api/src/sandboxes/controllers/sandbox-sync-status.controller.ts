import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiExtraModels, ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { SandboxResyncResponseDto, SandboxSyncDiffEntryDto, SandboxSyncStatusResponseDto } from '../dto'
import { SandboxResyncService } from '../services/sandbox-resync.service'
import { SandboxSyncStatusService } from '../services/sandbox-sync-status.service'

@ApiTags('sandboxes')
@ApiSecurity('bearerAuth')
@ApiExtraModels(SandboxSyncDiffEntryDto)
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('sandboxes')
export class SandboxSyncStatusController {
  constructor(
    private readonly syncStatusService: SandboxSyncStatusService,
    private readonly resyncService: SandboxResyncService,
  ) {}

  @Get(':sandboxId/sync-status')
  @RequirePermission(['sandboxes', 'read'])
  @ApiOperation({
    summary: 'Inspect database vs OpenSearch sync state for a single sandbox',
    description:
      'Returns a field-by-field comparison between the source-of-truth database row and the OpenSearch indexed document. Used to diagnose whether a sandbox is genuinely stuck or whether OpenSearch is stale relative to the database.',
  })
  @ApiParam({ name: 'sandboxId', description: 'Sandbox ID' })
  @ApiResponse({ status: 200, description: 'Sync status comparison', type: SandboxSyncStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Sandbox not found' })
  @ApiResponse({ status: 502, description: 'OpenSearch lookup failed' })
  async getSyncStatus(@Param('sandboxId') sandboxId: string): Promise<SandboxSyncStatusResponseDto> {
    return this.syncStatusService.inspect(sandboxId)
  }

  @Post(':sandboxId/sync-status/resync')
  @RequirePermission(['sandboxes', 'resync'])
  @ApiOperation({
    summary:
      'Force an OpenSearch resync for EVERY sandbox in the organization that owns this sandbox (organization-scoped, not sandbox-scoped)',
    description:
      'IMPORTANT: this operation is organization-scoped, not sandbox-scoped. The :sandboxId path parameter is only used to resolve the owning organizationId — the resync itself affects EVERY sandbox in that organization. Mechanism: inserts a Debezium signal row that triggers an incremental snapshot of public.sandbox filtered by organizationId. Other sandboxes in the same organization may briefly appear out of sync to their owners while the resync propagates. Idempotent — each call enqueues a fresh signal.',
  })
  @ApiParam({
    name: 'sandboxId',
    description:
      'Any sandbox belonging to the organization you want to resync. Used to derive organizationId server-side.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resync signal enqueued for the entire organization that owns the referenced sandbox',
    type: SandboxResyncResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sandbox not found' })
  @ApiResponse({ status: 500, description: 'Failed to enqueue resync signal' })
  @Audit({
    action: AuditAction.FORCE_RESYNC,
    targetType: AuditTarget.SANDBOX,
    targetIdFromRequest: (req) => req.params.sandboxId,
  })
  async forceOrganizationResync(@Param('sandboxId') sandboxId: string): Promise<SandboxResyncResponseDto> {
    return this.resyncService.forceResyncForSandbox(sandboxId)
  }
}
