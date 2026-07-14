import { Module } from '@nestjs/common'
import { SandboxTelemetryController } from './controllers/sandbox-telemetry.controller'
import { SandboxTelemetryService } from './services/sandbox-telemetry.service'
import { SandboxModule } from '../sandbox/sandbox.module'
import { OrganizationModule } from '../organization/organization.module'

@Module({
  imports: [SandboxModule, OrganizationModule],
  controllers: [SandboxTelemetryController],
  providers: [SandboxTelemetryService],
  exports: [SandboxTelemetryService],
})
export class SandboxTelemetryModule {}
