import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { SandboxState } from '@api/sandbox/enums/sandbox-state.enum'
import { SandboxDesiredState } from '@api/sandbox/enums/sandbox-desired-state.enum'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { BackupState } from '@api/sandbox/enums/backup-state.enum'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

export class SandboxResponseDto implements Partial<Sandbox> {
  @Expose() @ApiProperty() id: string
  @Expose() @ApiProperty() name: string
  @Expose() @ApiPropertyOptional() errorReason?: string
  @Expose() @ApiProperty() organizationId: string
  @Expose() @ApiProperty() region: string
  @Expose() @ApiProperty({ enum: SandboxState }) state: SandboxState
  @Expose() @ApiProperty({ enum: SandboxDesiredState }) desiredState: SandboxDesiredState
  @Expose() @ApiProperty({ enum: SandboxClass }) class: SandboxClass
  @Expose() @ApiPropertyOptional() runnerId?: string
  @Expose() @ApiProperty() labels: Record<string, string>
  @Expose() @ApiProperty() cpu: number
  @Expose() @ApiProperty() mem: number
  @Expose() @ApiProperty() disk: number
  @Expose() @ApiProperty() gpu: number
  @Expose() @ApiProperty() createdAt: Date
  @Expose() @ApiProperty() networkBlockAll: boolean
  @Expose() @ApiPropertyOptional() networkAllowList?: string
  @Expose() @ApiProperty({ enum: BackupState }) backupState: BackupState
  @Expose() @ApiPropertyOptional() backupErrorReason?: string | null
  @Expose() @ApiProperty() autoStopInterval: number
  @Expose() @ApiProperty() autoArchiveInterval: number
  @Expose() @ApiProperty() autoDeleteInterval: number
  @Expose() @ApiProperty() pending: boolean
  @Expose() @ApiProperty() recoverable: boolean
  @Expose() @ApiProperty() public: boolean
}

export class SandboxSearchDataDto {
  @ApiProperty({ type: [SandboxResponseDto], description: 'List of sandboxes' })
  sandboxes: SandboxResponseDto[]
}

export class SandboxSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: SandboxSearchDataDto, description: 'Search results data' })
  data: SandboxSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
