import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

@ApiSchema({ name: 'RegenerateApiKeyResponse' })
export class RegenerateApiKeyResponseDto {
  @ApiProperty({
    description: 'The newly generated API key',
    example: 'api-key-xyz123',
  })
  @IsString()
  @IsNotEmpty()
  apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }
}
