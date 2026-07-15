import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { InventorySyncService } from '../services'
import { SyncStatusDto } from '../dto'

@ApiTags('fleet')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('fleet/sync')
export class FleetSyncController {
  constructor(private readonly syncService: InventorySyncService) {}

  @Get()
  @RequirePermission(['fleet', 'read'])
  @ApiOperation({ summary: 'Current inventory sync status' })
  @ApiResponse({ status: 200, description: 'Sync status', type: SyncStatusDto })
  status(): SyncStatusDto {
    return this.syncService.getStatus()
  }

  @Post()
  @RequirePermission(['fleet', 'write'])
  @ApiOperation({ summary: 'Trigger an inventory sync now' })
  @ApiResponse({ status: 201, description: 'Sync status after the run', type: SyncStatusDto })
  @Audit({ action: AuditAction.FLEET_SYNC, targetType: AuditTarget.FLEET_INVENTORY })
  async trigger(): Promise<SyncStatusDto> {
    return this.syncService.sync()
  }
}
