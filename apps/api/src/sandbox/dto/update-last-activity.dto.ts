import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

@ApiSchema({ name: 'UpdateLastActivity' })
export class UpdateLastActivityDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Optional type of interaction that reset the activity timer.',
    example: 'toolbox',
  })
  activityType?: string
}
