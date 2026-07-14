import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'

/**
 * A support-initiated request to create a region quota. The quota is created
 * immediately with the configured default limits and follows the request
 * lifecycle: pending approval, auto-deleted after the TTL unless approved.
 */
export class CreateQuotaRequestDto {
  @ApiProperty({ description: 'Organization ID (UUID)' })
  @IsString()
  @IsNotEmpty()
  organizationId: string

  @ApiProperty({ description: 'Region ID (e.g. "us", "eu")' })
  @IsString()
  @IsNotEmpty()
  regionId: string

  @ApiPropertyOptional({
    description: 'Sandbox class of the quota. Defaults to "container".',
    enum: SandboxClass,
  })
  @IsOptional()
  @IsEnum(SandboxClass)
  sandboxClass?: SandboxClass

  @ApiPropertyOptional({ description: 'Why this quota is needed (shown to approvers)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}
