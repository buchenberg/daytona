import { ApiProperty, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'OrganizationSandboxDefaultLimitedNetworkEgress' })
export class OrganizationSandboxDefaultLimitedNetworkEgressDto {
  @ApiProperty({
    description: 'Sandbox default limited network egress',
  })
  sandboxDefaultLimitedNetworkEgress: boolean
}
