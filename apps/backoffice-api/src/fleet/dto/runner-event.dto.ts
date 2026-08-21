import { ApiProperty } from '@nestjs/swagger'
import { RunnerEventType } from '../../backoffice-db/entities/runner-event.entity'

export class RunnerEventDto {
  @ApiProperty()
  id: string

  @ApiProperty({ type: String, nullable: true })
  runnerName?: string | null

  @ApiProperty({ enum: RunnerEventType, enumName: 'RunnerEventType' })
  type: RunnerEventType

  @ApiProperty()
  message: string

  @ApiProperty({ type: String, nullable: true })
  requestId?: string | null

  @ApiProperty()
  actor: string

  @ApiProperty()
  createdAt: Date
}
