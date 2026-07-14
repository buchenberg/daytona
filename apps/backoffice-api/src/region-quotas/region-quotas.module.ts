import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { Organization } from '@api/organization/entities/organization.entity'
import { Region } from '@api/region/entities/region.entity'
import { QuotaRequest } from '../backoffice-db/entities/quota-request.entity'
import {
  RegionQuotasController,
  RegionQuotasBulkController,
  RegionQuotasSearchController,
  QuotaRequestsController,
} from './controllers'
import {
  RegionQuotasService,
  RegionQuotasBulkService,
  RegionQuotasSearchService,
  QuotaRequestService,
  QuotaRequestExpiryService,
} from './services'
import { AuthModule } from '../auth/auth.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([RegionQuota, Organization, Region]),
    TypeOrmModule.forFeature([QuotaRequest], 'backoffice'),
    AuthModule,
    AuditModule,
  ],
  controllers: [
    RegionQuotasController,
    RegionQuotasBulkController,
    RegionQuotasSearchController,
    QuotaRequestsController,
  ],
  providers: [
    RegionQuotasService,
    RegionQuotasBulkService,
    RegionQuotasSearchService,
    QuotaRequestService,
    QuotaRequestExpiryService,
  ],
  exports: [RegionQuotasService, RegionQuotasBulkService, RegionQuotasSearchService, QuotaRequestService],
})
export class RegionQuotasModule {}
