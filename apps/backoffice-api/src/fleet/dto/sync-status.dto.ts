import { ApiProperty } from '@nestjs/swagger'

export class SyncStatusDto {
  @ApiProperty({ enum: ['never_ran', 'running', 'ok', 'error'] })
  state: 'never_ran' | 'running' | 'ok' | 'error'

  @ApiProperty({ type: Date, nullable: true })
  startedAt: Date | null

  @ApiProperty({ type: Date, nullable: true })
  finishedAt: Date | null

  @ApiProperty({ type: String, nullable: true })
  commit: string | null

  @ApiProperty({ type: String, nullable: true })
  error: string | null

  @ApiProperty()
  hosts: number

  @ApiProperty()
  added: number

  @ApiProperty()
  removed: number
}
