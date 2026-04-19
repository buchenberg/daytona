import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { RunnerState } from '@api/sandbox/enums/runner-state.enum'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

export class RunnerResponseDto implements Partial<Runner> {
  @Expose() @ApiProperty() id: string
  @Expose() @ApiProperty() domain: string
  @Expose() @ApiProperty() region: string
  @Expose() @ApiProperty({ enum: RunnerState }) state: RunnerState
  @Expose() @ApiProperty({ enum: SandboxClass }) class: SandboxClass
  @Expose() @ApiProperty() currentCpuUsagePercentage: number
  @Expose() @ApiProperty() currentMemoryUsagePercentage: number
  @Expose() @ApiProperty() currentDiskUsagePercentage: number
  @Expose() @ApiPropertyOptional() availabilityScore?: number
  @Expose() @ApiProperty() cpu: number
  @Expose() @ApiProperty() memoryGiB: number
  @Expose() @ApiProperty() diskGiB: number
  @Expose() @ApiPropertyOptional() lastChecked?: Date
  @Expose() @ApiProperty() unschedulable: boolean
  @Expose() @ApiProperty() draining: boolean
  @Expose() @ApiPropertyOptional({ nullable: true, type: String }) appVersion?: string | null
  @Expose() @ApiProperty() apiVersion: string
}

export class RunnerSearchDataDto {
  @ApiProperty({ type: [RunnerResponseDto], description: 'List of runners' })
  runners: RunnerResponseDto[]
}

export class RunnerSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: RunnerSearchDataDto, description: 'Search results data' })
  data: RunnerSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
