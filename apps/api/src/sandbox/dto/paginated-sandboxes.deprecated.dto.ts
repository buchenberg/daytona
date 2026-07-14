import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { SandboxDto } from './sandbox.dto'

@ApiSchema({ name: 'PaginatedSandboxes_deprecated' })
export class PaginatedSandboxesDtoDeprecated {
  @ApiProperty({ type: [SandboxDto] })
  items: SandboxDto[]

  @ApiProperty()
  total: number

  @ApiProperty()
  page: number

  @ApiProperty()
  totalPages: number
}
