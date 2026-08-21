import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { SecretDto } from './secret.dto'

@ApiSchema({ name: 'ListSecretsResponse' })
export class ListSecretsResponseDto {
  @ApiProperty({
    description: 'List of results for the current page',
    type: [SecretDto],
  })
  items: SecretDto[]

  @ApiProperty({
    description: 'Total number of secrets matching the filters',
  })
  total: number

  @ApiProperty({
    description: 'Cursor for the next page of results',
    type: String,
    nullable: true,
  })
  nextCursor: string | null
}
