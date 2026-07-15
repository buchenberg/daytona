import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { AuthenticatedRequest, FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { MaintenanceRequestsService } from '../services'
import {
  AddMaintenanceNoteDto,
  CreateMaintenanceRequestDto,
  IncomingMaintenanceRequestsResponseDto,
  MaintenanceRequestDetailDto,
  MaintenanceRequestDto,
  RunnerEventDto,
  TransitionMaintenanceRequestDto,
  UpdateMaintenanceRequestDto,
} from '../dto'

@ApiTags('fleet')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('fleet/maintenance-requests')
export class MaintenanceRequestsController {
  constructor(private readonly requestsService: MaintenanceRequestsService) {}

  @Get('incoming')
  @RequirePermission(['fleet', 'read'])
  @ApiOperation({ summary: 'Incoming (not yet acknowledged) maintenance requests — notifications feed' })
  @ApiResponse({ status: 200, description: 'Incoming requests', type: IncomingMaintenanceRequestsResponseDto })
  async incoming(): Promise<IncomingMaintenanceRequestsResponseDto> {
    const { items, total } = await this.requestsService.listIncoming()
    return { success: true, data: { requests: items }, total }
  }

  @Post()
  @RequirePermission(['fleet', 'write'])
  @ApiOperation({ summary: 'File a maintenance request' })
  @ApiBody({ type: CreateMaintenanceRequestDto })
  @ApiResponse({ status: 201, description: 'Created request', type: MaintenanceRequestDto })
  @ApiResponse({ status: 400, description: 'Unknown runners' })
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.MAINTENANCE_REQUEST,
    targetIdFromResult: (result) => result?.id,
  })
  async create(
    @Body() dto: CreateMaintenanceRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MaintenanceRequestDto> {
    return this.requestsService.create(dto, req.user?.email ?? '')
  }

  @Get(':id')
  @RequirePermission(['fleet', 'read'])
  @ApiOperation({ summary: 'Request detail with live drain progress and event timeline' })
  @ApiResponse({ status: 200, description: 'Request detail', type: MaintenanceRequestDetailDto })
  @ApiResponse({ status: 404, description: 'Unknown request' })
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<MaintenanceRequestDetailDto> {
    return this.requestsService.detail(id)
  }

  @Patch(':id')
  @RequirePermission(['fleet', 'write'])
  @ApiOperation({ summary: 'Update request title/description/due date/Slack link' })
  @ApiResponse({ status: 200, description: 'Updated request', type: MaintenanceRequestDto })
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.MAINTENANCE_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> {
    return this.requestsService.update(id, dto)
  }

  @Post(':id/status')
  @RequirePermission(['fleet', 'write'])
  @ApiOperation({ summary: 'Transition the request to a new status' })
  @ApiResponse({ status: 201, description: 'Request after the transition', type: MaintenanceRequestDto })
  @ApiResponse({ status: 400, description: 'Transition not allowed' })
  @Audit({
    action: AuditAction.MAINTENANCE_STATUS_CHANGE,
    targetType: AuditTarget.MAINTENANCE_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
    requestMetadata: { status: (req) => req.body.status, comment: (req) => req.body.comment },
  })
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionMaintenanceRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MaintenanceRequestDto> {
    return this.requestsService.transition(id, dto, req.user?.email ?? '')
  }

  @Post(':id/notes')
  @RequirePermission(['fleet', 'write'])
  @ApiOperation({ summary: 'Add a note to the request timeline' })
  @ApiResponse({ status: 201, description: 'Recorded note', type: RunnerEventDto })
  @Audit({
    action: AuditAction.MAINTENANCE_NOTE_ADD,
    targetType: AuditTarget.MAINTENANCE_REQUEST,
    targetIdFromRequest: (req) => req.params.id,
  })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMaintenanceNoteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RunnerEventDto> {
    return this.requestsService.addNote(id, dto.message, req.user?.email ?? '')
  }
}
