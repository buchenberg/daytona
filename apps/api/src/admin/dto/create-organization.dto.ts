import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'
import { IsSafeDisplayString } from '../../common/validators'

@ApiSchema({ name: 'AdminCreateOrganization' })
export class AdminCreateOrganizationDto {
  @ApiProperty({
    description: 'The ID of the user the organization will be created for',
    example: 'user_123',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  userId: string

  @ApiProperty({
    description: 'The name of organization',
    example: 'My Organization',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @IsSafeDisplayString()
  name: string

  @ApiProperty({
    description: 'The ID of the default region for the organization',
    example: 'us',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  defaultRegionId: string
}
