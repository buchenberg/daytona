import { ApiProperty } from '@nestjs/swagger'
import { MaintenanceRequestDto } from './maintenance-request.dto'
import { RunnerEventDto } from './runner-event.dto'

export class ProdRunnerDto {
  @ApiProperty()
  id: string

  @ApiProperty({ type: String, nullable: true })
  domain: string | null

  @ApiProperty()
  region: string

  @ApiProperty()
  state: string

  @ApiProperty()
  unschedulable: boolean

  @ApiProperty()
  draining: boolean

  @ApiProperty()
  availabilityScore: number

  @ApiProperty()
  sandboxClass: string

  @ApiProperty()
  cpu: number

  @ApiProperty()
  memoryGiB: number

  @ApiProperty()
  diskGiB: number

  @ApiProperty({ type: Number, nullable: true })
  gpu: number | null

  @ApiProperty({ type: String, nullable: true })
  gpuType: string | null

  @ApiProperty()
  currentCpuUsagePercentage: number

  @ApiProperty()
  currentMemoryUsagePercentage: number

  @ApiProperty()
  currentDiskUsagePercentage: number

  @ApiProperty()
  currentAllocatedCpu: number

  @ApiProperty()
  currentStartedSandboxes: number

  @ApiProperty()
  currentSnapshotCount: number

  @ApiProperty({ type: Date, nullable: true })
  lastChecked: Date | null

  @ApiProperty({ type: String, nullable: true })
  appVersion: string | null

  @ApiProperty()
  createdAt: Date
}

/** Inventory record merged with live production state. */
export class FleetRunnerDto {
  @ApiProperty()
  name: string

  @ApiProperty()
  source: string

  @ApiProperty()
  enabled: boolean

  @ApiProperty()
  env: string

  @ApiProperty({ type: String, nullable: true })
  provider: string | null

  @ApiProperty({ type: String, nullable: true })
  serverType: string | null

  @ApiProperty({ type: String, nullable: true })
  os: string | null

  @ApiProperty({ type: String, nullable: true })
  ip: string | null

  @ApiProperty({ type: String, nullable: true })
  geo: string | null

  /** Inventory region; falls back to `location` in filters and the UI when unset */
  @ApiProperty({ type: String, nullable: true })
  region: string | null

  @ApiProperty({ type: String, nullable: true })
  location: string | null

  @ApiProperty({ type: String, nullable: true })
  model: string | null

  @ApiProperty({ type: String, nullable: true })
  nicSpeed: string | null

  @ApiProperty({ type: String, nullable: true })
  monthlyCost: string | null

  @ApiProperty({ type: String, nullable: true })
  hourlyCost: string | null

  @ApiProperty({ type: String, nullable: true })
  tenant: string | null

  @ApiProperty()
  gpu: boolean

  @ApiProperty({ type: [String] })
  groups: string[]

  @ApiProperty({ type: String, nullable: true })
  domain: string | null

  @ApiProperty({ type: Date, nullable: true })
  provisionedAt: Date | null

  @ApiProperty({ type: Date, nullable: true })
  removedAt: Date | null

  @ApiProperty()
  lastSyncAt: Date

  @ApiProperty({ type: ProdRunnerDto, nullable: true })
  prod: ProdRunnerDto | null

  @ApiProperty()
  activeSandboxes: number

  @ApiProperty()
  openRequests: number
}

export class SandboxStateCountDto {
  @ApiProperty()
  state: string

  @ApiProperty()
  count: number
}

/** Live evacuation status of one runner, keyed the same way the app decides "drain done". */
export class DrainStatusDto {
  /** Sandboxes whose desiredState != destroyed — must reach 0 before maintenance */
  @ApiProperty()
  remaining: number

  /** Currently running sandboxes */
  @ApiProperty()
  started: number

  /** Stopped sandboxes without a completed backup (would block a safe migration) */
  @ApiProperty()
  stoppedWithoutBackup: number
}

export class FleetRunnerDetailDto extends FleetRunnerDto {
  @ApiProperty({ type: [SandboxStateCountDto] })
  sandboxStates: SandboxStateCountDto[]

  @ApiProperty({ type: DrainStatusDto, nullable: true })
  drain: DrainStatusDto | null

  @ApiProperty({ type: [MaintenanceRequestDto] })
  requests: MaintenanceRequestDto[]

  @ApiProperty({ type: [RunnerEventDto] })
  events: RunnerEventDto[]
}
