import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { RegionQuota } from '../entities/region-quota.entity'
import { SandboxClass } from '../../sandbox/enums/sandbox-class.enum'
import { GpuType } from '../../sandbox/enums/gpu-type.enum'

@ApiSchema({ name: 'RegionQuota' })
export class RegionQuotaDto {
  @ApiProperty()
  organizationId: string

  @ApiProperty()
  regionId: string

  @ApiProperty({ enum: SandboxClass, enumName: 'SandboxClass' })
  sandboxClass: SandboxClass

  @ApiProperty()
  totalCpuQuota: number

  @ApiProperty()
  totalMemoryQuota: number

  @ApiProperty()
  totalDiskQuota: number

  @ApiProperty()
  totalGpuQuota: number

  @ApiPropertyOptional({ enum: GpuType, enumName: 'GpuType', isArray: true })
  allowedGpuTypes?: GpuType[]

  @ApiProperty({ nullable: true })
  maxCpuPerSandbox: number | null

  @ApiProperty({ nullable: true })
  maxMemoryPerSandbox: number | null

  @ApiProperty({ nullable: true })
  maxDiskPerSandbox: number | null

  @ApiProperty({ nullable: true })
  maxDiskPerNonEphemeralSandbox: number | null

  @ApiProperty({ nullable: true, description: 'CPU maximum per requested GPU unit for GPU sandboxes.' })
  maxCpuPerGpu: number | null

  @ApiProperty({ nullable: true, description: 'Memory maximum per requested GPU unit for GPU sandboxes.' })
  maxMemoryPerGpu: number | null

  @ApiProperty({ nullable: true, description: 'Disk maximum per requested GPU unit for GPU sandboxes.' })
  maxDiskPerGpu: number | null

  constructor(regionQuota: RegionQuota) {
    this.organizationId = regionQuota.organizationId
    this.regionId = regionQuota.regionId
    this.sandboxClass = regionQuota.sandboxClass
    this.totalCpuQuota = regionQuota.totalCpuQuota
    this.totalMemoryQuota = regionQuota.totalMemoryQuota
    this.totalDiskQuota = regionQuota.totalDiskQuota
    this.totalGpuQuota = regionQuota.totalGpuQuota
    if (regionQuota.allowedGpuTypes) {
      this.allowedGpuTypes = regionQuota.allowedGpuTypes
    }
    this.maxCpuPerSandbox = regionQuota.maxCpuPerSandbox
    this.maxMemoryPerSandbox = regionQuota.maxMemoryPerSandbox
    this.maxDiskPerSandbox = regionQuota.maxDiskPerSandbox
    this.maxDiskPerNonEphemeralSandbox = regionQuota.maxDiskPerNonEphemeralSandbox
    this.maxCpuPerGpu = regionQuota.maxCpuPerGpu
    this.maxMemoryPerGpu = regionQuota.maxMemoryPerGpu
    this.maxDiskPerGpu = regionQuota.maxDiskPerGpu
  }
}
