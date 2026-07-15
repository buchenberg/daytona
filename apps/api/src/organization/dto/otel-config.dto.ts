import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { IsObject, IsOptional, IsString } from 'class-validator'

@ApiSchema({ name: 'OtelConfig' })
export class OtelConfigDto {
  @ApiProperty({
    description: 'Endpoint',
  })
  @IsString()
  endpoint: string

  @ApiProperty({
    description: 'Headers',
    example: {
      'x-api-key': 'my-api-key',
    },
    nullable: true,
    required: false,
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  @IsOptional()
  headers?: Record<string, string>

  @ApiProperty({
    description: 'Organization ID the config belongs to',
    required: false,
  })
  organizationId?: string
}
