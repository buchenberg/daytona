import { ApiProperty, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'ToolboxProxyUrl' })
export class ToolboxProxyUrlDto {
  @ApiProperty({
    description: 'The toolbox proxy URL for the sandbox',
    example: 'https://proxy.app.daytona.io/toolbox',
  })
  url: string

  constructor(url: string) {
    this.url = url
  }
}
