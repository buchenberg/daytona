import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'

/**
 * A support-initiated temporary increase to an organization's region quota.
 * Deltas are the amount to ADD to the current totals (cpu cores / GiB / GiB).
 * At least one delta must be greater than zero.
 */
export class CreateQuotaBumpDto {
  @ApiProperty({ description: 'Organization ID (UUID)' })
  @IsString()
  @IsNotEmpty()
  organizationId: string

  @ApiProperty({ description: 'Region ID (e.g. "us", "eu")' })
  @IsString()
  @IsNotEmpty()
  regionId: string

  @ApiPropertyOptional({
    description: 'Sandbox class of the quota to bump. Defaults to "container".',
    enum: SandboxClass,
  })
  @IsOptional()
  @IsEnum(SandboxClass)
  sandboxClass?: SandboxClass

  @ApiPropertyOptional({ description: 'CPU cores to add to totalCpuQuota', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cpuDelta?: number

  @ApiPropertyOptional({ description: 'Memory (GiB) to add to totalMemoryQuota', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  memoryDelta?: number

  @ApiPropertyOptional({ description: 'Disk (GiB) to add to totalDiskQuota', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  diskDelta?: number

  @ApiPropertyOptional({ description: 'Why this bump is needed (shown to approvers)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}

/**
 * Optional note an approver can attach when rejecting a pending bump.
 */
export class RejectQuotaBumpDto {
  @ApiPropertyOptional({ description: 'Reason for rejecting the bump' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}
