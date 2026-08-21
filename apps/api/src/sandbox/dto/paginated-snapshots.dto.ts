import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { SnapshotDto } from './snapshot.dto'

@ApiSchema({ name: 'PaginatedSnapshots' })
export class PaginatedSnapshotsDto {
  @ApiProperty({ type: [SnapshotDto] })
  items: SnapshotDto[]

  @ApiProperty()
  total: number

  @ApiProperty()
  page: number

  @ApiProperty()
  totalPages: number
}
