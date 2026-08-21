import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

@ApiSchema({ name: 'CreateWarmPool' })
export class CreateWarmPoolDto {
  @ApiProperty({
    description:
      'The snapshot (id or name) to keep warm sandboxes for. A pool only serves sandbox creates that use ' +
      'this snapshot with the default OS user and no custom env, volumes or secrets.',
    example: 'my-snapshot',
  })
  @IsString()
  @IsNotEmpty()
  snapshot: string

  @ApiProperty({
    description: 'Number of warm sandboxes to keep ready (capped by the organization quota)',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  pool: number

  @ApiProperty({
    description: 'Target region for the warm pool. Defaults to the organization default region.',
    required: false,
    example: 'us',
  })
  @IsOptional()
  @IsString()
  target?: string
}
