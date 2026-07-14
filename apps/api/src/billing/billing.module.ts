import { Module } from '@nestjs/common'
import { BillingService } from './services/billing.service'

@Module({
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
