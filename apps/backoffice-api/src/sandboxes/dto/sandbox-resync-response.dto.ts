import { ApiProperty } from '@nestjs/swagger'

export class SandboxResyncResponseDto {
  @ApiProperty({ description: 'True when the resync signal was inserted successfully' })
  acknowledged: boolean

  @ApiProperty({ description: 'Sandbox identifier the request was issued for' })
  sandboxId: string

  @ApiProperty({ description: 'Organization that will be backfilled by the Debezium incremental snapshot' })
  organizationId: string

  @ApiProperty({ description: 'Server timestamp when the signal was inserted', example: '2026-06-09T12:34:56.789Z' })
  requestedAt: string
}
