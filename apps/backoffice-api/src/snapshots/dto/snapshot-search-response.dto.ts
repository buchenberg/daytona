import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SnapshotState } from '@api/sandbox/enums/snapshot-state.enum'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

export class SnapshotResponseDto implements Partial<Snapshot> {
  @Expose() @ApiProperty() id: string
  @Expose() @ApiProperty() name: string
  @Expose() @ApiPropertyOptional() errorReason?: string
  @Expose() @ApiProperty() organizationId: string
  @Expose() @ApiProperty() imageName: string
  @Expose() @ApiProperty({ enum: SnapshotState }) state: SnapshotState
  @Expose() @ApiProperty() general: boolean
  @Expose() @ApiProperty() hideFromUsers: boolean
  @Expose() @ApiPropertyOptional() size?: number
  @Expose() @ApiProperty() cpu: number
  @Expose() @ApiProperty() mem: number
  @Expose() @ApiProperty() disk: number
  @Expose() @ApiProperty() gpu: number
  @Expose() @ApiProperty() createdAt: Date
  @Expose() @ApiPropertyOptional() lastUsedAt?: Date
}

export class SnapshotSearchDataDto {
  @ApiProperty({ type: [SnapshotResponseDto], description: 'List of snapshots' })
  snapshots: SnapshotResponseDto[]
}

export class SnapshotSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: SnapshotSearchDataDto, description: 'Search results data' })
  data: SnapshotSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
