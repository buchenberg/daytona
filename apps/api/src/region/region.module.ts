import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Region } from './entities/region.entity'
import { RegionService } from './services/region.service'
import { RegionRoutingService } from './services/region-routing.service'
import { Runner } from '../sandbox/entities/runner.entity'
import { RegionQuota } from '../organization/entities/region-quota.entity'
import { RegionController } from './controllers/region.controller'
import { SnapshotRepository } from '../sandbox/repositories/snapshot.repository'

@Module({
  imports: [TypeOrmModule.forFeature([Region, Runner, RegionQuota])],
  controllers: [RegionController],
  providers: [
    RegionService,
    RegionRoutingService,
    {
      provide: SnapshotRepository,
      inject: [DataSource, EventEmitter2],
      useFactory: (dataSource: DataSource, eventEmitter: EventEmitter2) =>
        new SnapshotRepository(dataSource, eventEmitter),
    },
  ],
  exports: [RegionService, RegionRoutingService],
})
export class RegionModule {}
