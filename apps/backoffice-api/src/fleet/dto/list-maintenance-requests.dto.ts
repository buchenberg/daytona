import { ApiProperty } from '@nestjs/swagger'
import { MaintenanceRequestDto } from './maintenance-request.dto'

export class MaintenanceRequestListDataDto {
  @ApiProperty({ type: [MaintenanceRequestDto] })
  requests: MaintenanceRequestDto[]
}

/** Incoming (status = requested) maintenance requests — the notifications feed. */
export class IncomingMaintenanceRequestsResponseDto {
  @ApiProperty()
  success: boolean

  @ApiProperty({ type: MaintenanceRequestListDataDto })
  data: MaintenanceRequestListDataDto

  @ApiProperty()
  total: number
}
