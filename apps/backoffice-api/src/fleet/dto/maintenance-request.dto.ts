import { ApiProperty } from '@nestjs/swagger'
import { MaintenanceStatus, MaintenanceType } from '../../backoffice-db/entities/maintenance-request.entity'
import { RunnerEventDto } from './runner-event.dto'

export class MaintenanceRequestDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  title: string

  @ApiProperty()
  description: string

  @ApiProperty({ enum: MaintenanceType, enumName: 'MaintenanceType' })
  type: MaintenanceType

  @ApiProperty({ enum: MaintenanceStatus, enumName: 'MaintenanceStatus' })
  status: MaintenanceStatus

  @ApiProperty({ type: [String] })
  runnerNames: string[]

  @ApiProperty()
  requestedBy: string

  @ApiProperty()
  createdBy: string

  @ApiProperty({ description: '0 = p0 (most urgent) … 3 = p3' })
  priority: number

  @ApiProperty({ type: Date, nullable: true })
  closedAt?: Date | null

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date

  /** Statuses this request may transition to next — the UI renders one action per entry. */
  @ApiProperty({ enum: MaintenanceStatus, enumName: 'MaintenanceStatus', isArray: true })
  allowedTransitions: MaintenanceStatus[]
}

/** Live per-runner evacuation state for a request. */
export class RunnerProgressDto {
  @ApiProperty()
  name: string

  @ApiProperty({ type: String, nullable: true })
  domain: string | null

  @ApiProperty({ type: String, nullable: true })
  prodState: string | null

  @ApiProperty()
  draining: boolean

  @ApiProperty()
  unschedulable: boolean

  /** Sandboxes still to evacuate (desiredState != destroyed) */
  @ApiProperty()
  remaining: number

  @ApiProperty()
  started: number

  @ApiProperty()
  stoppedWithoutBackup: number

  /** Nothing left on the runner — safe to hand over for maintenance */
  @ApiProperty()
  drained: boolean
}

export class MaintenanceRequestDetailDto extends MaintenanceRequestDto {
  @ApiProperty({ type: [RunnerProgressDto] })
  progress: RunnerProgressDto[]

  @ApiProperty({ type: [RunnerEventDto] })
  events: RunnerEventDto[]
}
