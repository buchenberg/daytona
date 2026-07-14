import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission, RequiredPermission } from '../../common/decorators/require-permission.decorator'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { QuotaRequestService, RequestActor } from '../services'
import {
  UpdateQuotaRequestDto,
  ListPendingQuotaRequestsQueryDto,
  RejectQuotaRequestDto,
  CreateQuotaRequestDto,
} from '../dto'

const REQUEST_OR_WRITE: RequiredPermission[] = [
  ['regionQuotas', 'request'],
  ['regionQuotas', 'write'],
]

// FlexibleAuthGuard guarantees req.user; narrow it to the fields the service needs.
const actorOf = (req: AuthenticatedRequest): RequestActor => ({ id: req.user?.id ?? '', email: req.user?.email ?? '' })

@ApiTags('region-quotas')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('region-quotas/requests')
export class QuotaRequestsController {
  constructor(private readonly quotaRequestService: QuotaRequestService) {}

  @Post('update')
  @RequirePermission(REQUEST_OR_WRITE)
  @ApiOperation({ summary: 'Request a temporary region quota update (increase)' })
  @ApiBody({ type: UpdateQuotaRequestDto })
  @ApiResponse({ status: 201, description: 'Request applied and pending approval' })
  @ApiResponse({ status: 403, description: 'Exceeds per-request cap or daily budget' })
  @ApiResponse({ status: 404, description: 'Region quota not found' })
  @ApiResponse({ status: 409, description: 'Region quota changed since read' })
  @Audit({
    action: AuditAction.QUOTA_REQUEST_UPDATE,
    targetType: AuditTarget.QUOTA_REQUEST,
    targetIdFromResult: (result) => result?.id,
    requestMetadata: {
      organizationId: (req) => req.body.organizationId,
      regionId: (req) => req.body.regionId,
      sandboxClass: (req) => req.body.sandboxClass ?? 'container',
      cpuDelta: (req) => req.body.cpuDelta ?? 0,
      memoryDelta: (req) => req.body.memoryDelta ?? 0,
      diskDelta: (req) => req.body.diskDelta ?? 0,
      gpuDelta: (req) => req.body.gpuDelta ?? 0,
      reason: (req) => req.body.reason,
    },
  })
  async requestUpdate(@Body() dto: UpdateQuotaRequestDto, @Req() req: AuthenticatedRequest) {
    return this.quotaRequestService.requestUpdate(actorOf(req), dto)
  }

  @Post('create')
  @RequirePermission(REQUEST_OR_WRITE)
  @ApiOperation({ summary: 'Create a region quota with the default limits (pending approval)' })
  @ApiBody({ type: CreateQuotaRequestDto })
  @ApiResponse({ status: 201, description: 'Quota created and pending approval' })
  @ApiResponse({ status: 404, description: 'Organization or region not found' })
  @ApiResponse({ status: 409, description: 'Quota or pending request already exists' })
  @Audit({
    action: AuditAction.QUOTA_REQUEST_CREATE,
    targetType: AuditTarget.QUOTA_REQUEST,
    targetIdFromResult: (result) => result?.id,
    requestMetadata: {
      organizationId: (req) => req.body.organizationId,
      regionId: (req) => req.body.regionId,
      sandboxClass: (req) => req.body.sandboxClass ?? 'container',
      reason: (req) => req.body.reason,
    },
  })
  async requestCreate(@Body() dto: CreateQuotaRequestDto, @Req() req: AuthenticatedRequest) {
    return this.quotaRequestService.requestCreate(actorOf(req), dto)
  }

  @Get()
  // Visible to any authenticated backoffice user (read-only notifications); only
  // regionQuotas:write users can act on them via approve/reject below.
  @ApiOperation({ summary: 'List pending quota requests awaiting approval' })
  @ApiResponse({ status: 200, description: 'Pending requests' })
  async listPending(@Query() query: ListPendingQuotaRequestsQueryDto) {
    const { items, total } = await this.quotaRequestService.listPending(query.page, query.pageSize)
    return { success: true, data: { requests: items }, total }
  }

  @Get('budget')
  @RequirePermission(REQUEST_OR_WRITE)
  @ApiOperation({ summary: "Get the current editor's remaining daily update budget" })
  @ApiResponse({ status: 200, description: 'Daily budget, spent, and remaining' })
  async budget(@Req() req: AuthenticatedRequest) {
    return this.quotaRequestService.getRemainingBudget(actorOf(req).id)
  }

  @Get('create-defaults')
  @RequirePermission(REQUEST_OR_WRITE)
  @ApiOperation({ summary: 'Get the default limits a create request grants' })
  @ApiResponse({ status: 200, description: 'Default CPU / memory / disk / GPU limits' })
  createDefaults() {
    return this.quotaRequestService.createLimits
  }

  @Post(':id/approve')
  @RequirePermission(['regionQuotas', 'write'])
  @ApiOperation({ summary: 'Approve a pending request (make it permanent)' })
  @ApiResponse({ status: 200, description: 'Request approved' })
  @ApiResponse({ status: 400, description: 'Request is not pending' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @Audit({
    action: AuditAction.QUOTA_REQUEST_APPROVE,
    targetType: AuditTarget.QUOTA_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.quotaRequestService.approve(actorOf(req), id)
  }

  @Post(':id/reject')
  @RequirePermission(['regionQuotas', 'write'])
  @ApiOperation({ summary: 'Reject a pending request and revert the quota' })
  @ApiResponse({ status: 200, description: 'Request rejected and reverted' })
  @ApiResponse({ status: 400, description: 'Request is not pending' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @Audit({
    action: AuditAction.QUOTA_REQUEST_REJECT,
    targetType: AuditTarget.QUOTA_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async reject(@Param('id') id: string, @Body() dto: RejectQuotaRequestDto, @Req() req: AuthenticatedRequest) {
    return this.quotaRequestService.reject(actorOf(req), id, dto?.reason)
  }

  @Post(':id/cancel')
  @RequirePermission(REQUEST_OR_WRITE)
  @ApiOperation({ summary: 'Cancel your own pending request and revert the quota' })
  @ApiResponse({ status: 200, description: 'Request cancelled and reverted' })
  @ApiResponse({ status: 400, description: 'Request is not pending' })
  @ApiResponse({ status: 403, description: 'Not the requester of this request' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @Audit({
    action: AuditAction.QUOTA_REQUEST_CANCEL,
    targetType: AuditTarget.QUOTA_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.quotaRequestService.cancel(actorOf(req), id)
  }
}
