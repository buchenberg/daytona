import { ApiProperty } from '@nestjs/swagger'

export class InitializeWebhooksResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful', example: true })
  success: boolean

  @ApiProperty({ description: 'Success message', required: false, example: 'Webhooks initialized successfully' })
  message?: string

  @ApiProperty({ description: 'Error message if operation failed', required: false })
  error?: string
}
