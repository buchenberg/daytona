/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { RegionQuota } from '../entities/region-quota.entity'
import { SandboxClass } from '../../sandbox/enums/sandbox-class.enum'
import { GpuType } from '../../sandbox/enums/gpu-type.enum'

@ApiSchema({ name: 'AvailableSandboxClass' })
export class AvailableSandboxClassDto {
  @ApiProperty()
  regionId: string

  @ApiProperty({ enum: SandboxClass, enumName: 'SandboxClass' })
  sandboxClass: SandboxClass

  @ApiProperty()
  gpuAvailable: boolean

  @ApiPropertyOptional({ enum: GpuType, enumName: 'GpuType', isArray: true })
  allowedGpuTypes?: GpuType[]

  constructor(regionQuota: RegionQuota) {
    this.regionId = regionQuota.regionId
    this.sandboxClass = regionQuota.sandboxClass
    const gpuTypesBlocked = regionQuota.allowedGpuTypes?.length === 0
    this.gpuAvailable = regionQuota.totalGpuQuota > 0 && !gpuTypesBlocked
    if (regionQuota.allowedGpuTypes) {
      this.allowedGpuTypes = regionQuota.allowedGpuTypes
    }
  }
}
