import { IsString, IsOptional, IsArray, Matches, ValidateIf } from 'class-validator'
import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'UpdateSecret' })
export class UpdateSecretDto {
  // Allow the field to be omitted, but reject an explicit null: the update flow
  // treats a present value as a real value to encrypt, so null would otherwise
  // be encrypted and fail. ValidateIf (rather than IsOptional) keeps IsString
  // active when the field is present, including when it is null.
  @ApiPropertyOptional({ description: 'New secret value' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  value?: string

  @ApiPropertyOptional({ description: 'Optional description of the secret' })
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional({
    description: 'Allowed hosts this secret may be sent to',
    type: [String],
    example: ['api.anthropic.com'],
  })
  // Reject explicit null (which would be persisted to a NOT NULL column) while
  // still allowing the field to be omitted.
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @Matches(
    /^(\*\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+|[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(\.[a-zA-Z]{2,})+)$/,
    {
      each: true,
      message:
        'Each host must be a valid hostname (e.g. api.example.com) or wildcard (*.example.com). Omit hosts entirely for unrestricted access.',
    },
  )
  hosts?: string[]
}
