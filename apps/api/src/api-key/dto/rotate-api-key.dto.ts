import { IsOptional, IsString, IsUUID } from 'class-validator'

export class RotateApiKeyDto {
  @IsUUID()
  organizationId: string

  @IsOptional()
  @IsString()
  previousApiKeyName?: string

  @IsOptional()
  @IsString()
  newApiKeyName?: string
}
