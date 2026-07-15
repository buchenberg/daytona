import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetRunner } from '../backoffice-db/entities/fleet-runner.entity'
import { MaintenanceRequest } from '../backoffice-db/entities/maintenance-request.entity'
import { RunnerEvent } from '../backoffice-db/entities/runner-event.entity'
import { AuthModule } from '../auth/auth.module'
import {
  FleetRunnersController,
  FleetSyncController,
  FleetSyncWebhookController,
  MaintenanceRequestsController,
} from './controllers'
import {
  FleetRunnersService,
  InventorySyncService,
  MaintenanceRequestsService,
  PlaybookRepoService,
  ProdRunnersService,
  RunnerEventsService,
} from './services'

// Response convention (matches the rest of the backoffice): search/list
// endpoints return the { success, data, pagination } envelope, everything
// else returns bare DTOs.
@Module({
  imports: [TypeOrmModule.forFeature([FleetRunner, MaintenanceRequest, RunnerEvent], 'backoffice'), AuthModule],
  controllers: [FleetRunnersController, FleetSyncController, FleetSyncWebhookController, MaintenanceRequestsController],
  providers: [
    FleetRunnersService,
    InventorySyncService,
    MaintenanceRequestsService,
    PlaybookRepoService,
    ProdRunnersService,
    RunnerEventsService,
  ],
})
export class FleetModule {}
