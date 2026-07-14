import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { FlexibleAuthGuard, AuthenticatedRequest } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission, RequiredPermission } from '../../common/decorators/require-permission.decorator'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { QuotaBumpService, BumpActor } from '../services'
import { CreateQuotaBumpDto, ListPendingQuotaBumpsQueryDto, RejectQuotaBumpDto } from '../dto'

const BUMP_OR_WRITE: RequiredPermission[] = [
  ['regionQuotas', 'bump'],
  ['regionQuotas', 'write'],
]

// FlexibleAuthGuard guarantees req.user; narrow it to the fields the service needs.
const actorOf = (req: AuthenticatedRequest): BumpActor => ({ id: req.user?.id ?? '', email: req.user?.email ?? '' })

@ApiTags('region-quotas')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('region-quotas/bumps')
export class QuotaBumpsController {
  constructor(private readonly quotaBumpService: QuotaBumpService) {}

  @Post()
  @RequirePermission(BUMP_OR_WRITE)
  @ApiOperation({ summary: 'Create a temporary region quota bump' })
  @ApiBody({ type: CreateQuotaBumpDto })
  @ApiResponse({ status: 201, description: 'Bump applied and pending approval' })
  @ApiResponse({ status: 403, description: 'Exceeds per-bump cap or daily budget' })
  @ApiResponse({ status: 404, description: 'Region quota not found' })
  @ApiResponse({ status: 409, description: 'Region quota changed since read' })
  @Audit({
    action: AuditAction.QUOTA_BUMP_CREATE,
    targetType: AuditTarget.QUOTA_BUMP_REQUEST,
    targetIdFromResult: (result) => result?.id,
    requestMetadata: {
      organizationId: (req) => req.body.organizationId,
      regionId: (req) => req.body.regionId,
      sandboxClass: (req) => req.body.sandboxClass ?? 'container',
      cpuDelta: (req) => req.body.cpuDelta ?? 0,
      memoryDelta: (req) => req.body.memoryDelta ?? 0,
      diskDelta: (req) => req.body.diskDelta ?? 0,
      reason: (req) => req.body.reason,
    },
  })
  async create(@Body() dto: CreateQuotaBumpDto, @Req() req: AuthenticatedRequest) {
    return this.quotaBumpService.createBump(actorOf(req), dto)
  }

  @Get()
  // Visible to any authenticated backoffice user (read-only notifications); only
  // regionQuotas:write users can act on them via approve/reject below.
  @ApiOperation({ summary: 'List pending quota bumps awaiting approval' })
  @ApiResponse({ status: 200, description: 'Pending bumps' })
  async listPending(@Query() query: ListPendingQuotaBumpsQueryDto) {
    const { items, total } = await this.quotaBumpService.listPending(query.page ?? 1, query.pageSize ?? 25)
    return { success: true, data: { bumps: items }, total }
  }

  @Get('budget')
  @RequirePermission(BUMP_OR_WRITE)
  @ApiOperation({ summary: "Get the current editor's remaining daily bump budget" })
  @ApiResponse({ status: 200, description: 'Daily budget, spent, and remaining' })
  async budget(@Req() req: AuthenticatedRequest) {
    return this.quotaBumpService.getRemainingBudget(actorOf(req).id)
  }

  @Post(':id/approve')
  @RequirePermission(['regionQuotas', 'write'])
  @ApiOperation({ summary: 'Approve a pending bump (make it permanent)' })
  @ApiResponse({ status: 200, description: 'Bump approved' })
  @ApiResponse({ status: 400, description: 'Bump is not pending' })
  @ApiResponse({ status: 404, description: 'Bump not found' })
  @Audit({
    action: AuditAction.QUOTA_BUMP_APPROVE,
    targetType: AuditTarget.QUOTA_BUMP_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.quotaBumpService.approve(actorOf(req), id)
  }

  @Post(':id/reject')
  @RequirePermission(['regionQuotas', 'write'])
  @ApiOperation({ summary: 'Reject a pending bump and revert the quota' })
  @ApiResponse({ status: 200, description: 'Bump rejected and reverted' })
  @ApiResponse({ status: 400, description: 'Bump is not pending' })
  @ApiResponse({ status: 404, description: 'Bump not found' })
  @Audit({
    action: AuditAction.QUOTA_BUMP_REJECT,
    targetType: AuditTarget.QUOTA_BUMP_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async reject(@Param('id') id: string, @Body() dto: RejectQuotaBumpDto, @Req() req: AuthenticatedRequest) {
    return this.quotaBumpService.reject(actorOf(req), id, dto?.reason)
  }

  @Post(':id/cancel')
  @RequirePermission(BUMP_OR_WRITE)
  @ApiOperation({ summary: 'Cancel your own pending bump and revert the quota' })
  @ApiResponse({ status: 200, description: 'Bump cancelled and reverted' })
  @ApiResponse({ status: 400, description: 'Bump is not pending' })
  @ApiResponse({ status: 403, description: 'Not the requester of this bump' })
  @ApiResponse({ status: 404, description: 'Bump not found' })
  @Audit({
    action: AuditAction.QUOTA_BUMP_CANCEL,
    targetType: AuditTarget.QUOTA_BUMP_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.quotaBumpService.cancel(actorOf(req), id)
  }
}
