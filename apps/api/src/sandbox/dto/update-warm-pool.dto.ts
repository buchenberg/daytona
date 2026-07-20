import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { IsInt, Min } from 'class-validator'

@ApiSchema({ name: 'UpdateWarmPool' })
export class UpdateWarmPoolDto {
  @ApiProperty({
    description: 'New desired number of warm sandboxes (0 drains the pool)',
    example: 5,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  pool: number
}
