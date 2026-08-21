import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ValidateNested, IsOptional, IsEnum } from 'class-validator'
import { Type } from 'class-transformer'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { UpdateRegionQuotaDto } from './update-region-quota.dto'

export class PatchRegionQuotaDto {
  @ApiPropertyOptional({
    description: 'Sandbox class of the quota row to update. Defaults to "container".',
    enum: SandboxClass,
  })
  @IsOptional()
  @IsEnum(SandboxClass)
  sandboxClass?: SandboxClass

  @ApiProperty({ type: () => UpdateRegionQuotaDto, description: 'Fields to update' })
  @ValidateNested()
  @Type(() => UpdateRegionQuotaDto)
  updates: UpdateRegionQuotaDto

  @ApiPropertyOptional({
    type: () => UpdateRegionQuotaDto,
    description:
      'Expected current values for optimistic concurrency control. Update fails with 409 if any field does not match.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRegionQuotaDto)
  preconditions?: UpdateRegionQuotaDto
}
