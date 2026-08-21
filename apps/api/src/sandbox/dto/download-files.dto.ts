import { ApiProperty, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'DownloadFiles' })
export class DownloadFilesDto {
  @ApiProperty({
    description: 'List of remote file paths to download',
    type: [String],
  })
  paths: string[]
}
