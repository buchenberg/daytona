import { IsOptional, IsString } from 'class-validator'

export class ProvisionStripeProjectsApiKeyDto {
  @IsString()
  userId: string

  @IsOptional()
  @IsString()
  apiKeyName?: string
}
