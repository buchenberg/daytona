import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { IsArray, IsEnum, IsNumber, IsOptional } from 'class-validator'
import { SandboxClass } from '../../sandbox/enums/sandbox-class.enum'
import { GpuType } from '../../sandbox/enums/gpu-type.enum'

@ApiSchema({ name: 'CreateOrganizationRegionQuota' })
export class CreateOrganizationRegionQuotaDto {
  @ApiProperty({ enum: SandboxClass, enumName: 'SandboxClass' })
  @IsEnum(SandboxClass)
  sandboxClass: SandboxClass

  @ApiProperty()
  @IsNumber()
  totalCpuQuota: number

  @ApiProperty()
  @IsNumber()
  totalMemoryQuota: number

  @ApiProperty()
  @IsNumber()
  totalDiskQuota: number

  @ApiProperty()
  @IsNumber()
  totalGpuQuota: number

  @ApiPropertyOptional({ enum: GpuType, enumName: 'GpuType', isArray: true, nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(GpuType, { each: true })
  allowedGpuTypes?: GpuType[] | null

  @ApiPropertyOptional({ nullable: true })
  @IsNumber()
  @IsOptional()
  maxCpuPerSandbox?: number | null

  @ApiPropertyOptional({ nullable: true })
  @IsNumber()
  @IsOptional()
  maxMemoryPerSandbox?: number | null

  @ApiPropertyOptional({ nullable: true })
  @IsNumber()
  @IsOptional()
  maxDiskPerSandbox?: number | null

  @ApiPropertyOptional({ nullable: true })
  @IsNumber()
  @IsOptional()
  maxDiskPerNonEphemeralSandbox?: number | null

  @ApiPropertyOptional({ nullable: true, description: 'CPU maximum per requested GPU unit for GPU sandboxes.' })
  @IsNumber()
  @IsOptional()
  maxCpuPerGpu?: number | null

  @ApiPropertyOptional({ nullable: true, description: 'Memory maximum per requested GPU unit for GPU sandboxes.' })
  @IsNumber()
  @IsOptional()
  maxMemoryPerGpu?: number | null

  @ApiPropertyOptional({ nullable: true, description: 'Disk maximum per requested GPU unit for GPU sandboxes.' })
  @IsNumber()
  @IsOptional()
  maxDiskPerGpu?: number | null
}
