/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { UpdateRegionQuotaDto } from '../dto/update-region-quota.dto'
import { PatchRegionQuotaDto } from '../dto/patch-region-quota.dto'
import { updateWithPreconditions } from '../../common/preconditions.util'

@Injectable()
export class RegionQuotasService {
  constructor(
    @InjectRepository(RegionQuota)
    private readonly regionQuotaRepository: Repository<RegionQuota>,
  ) {}

  /**
   * Update a single region quota
   */
  async update(
    organizationId: string,
    regionId: string,
    patchData: PatchRegionQuotaDto,
  ): Promise<{ regionQuota: RegionQuota; warnings: string[] }> {
    const regionQuota = await this.regionQuotaRepository.findOne({
      where: { organizationId, regionId },
      relations: ['organization'],
    })

    if (!regionQuota) {
      throw new Error(`Region quota not found for organization ${organizationId} and region ${regionId}`)
    }

    const updateData = patchData.updates

    const warnings = this.validateUpdate(regionQuota, updateData)

    // Atomic update: UPDATE ... SET updates WHERE orgId = ? AND regionId = ? AND preconditions
    const updated = await updateWithPreconditions(
      this.regionQuotaRepository,
      { organizationId, regionId },
      updateData,
      patchData.preconditions,
    )

    return { regionQuota: updated, warnings }
  }

  /**
   * Validate region quota updates and return warnings
   */
  private validateUpdate(regionQuota: RegionQuota, updateData: UpdateRegionQuotaDto): string[] {
    const warnings: string[] = []

    // Warn if reducing quotas significantly
    if (updateData.totalCpuQuota !== undefined && updateData.totalCpuQuota < regionQuota.totalCpuQuota / 2) {
      warnings.push(
        `Reducing totalCpuQuota from ${regionQuota.totalCpuQuota} to ${updateData.totalCpuQuota} (>50% reduction) may affect running sandboxes`,
      )
    }

    if (updateData.totalMemoryQuota !== undefined && updateData.totalMemoryQuota < regionQuota.totalMemoryQuota / 2) {
      warnings.push(
        `Reducing totalMemoryQuota from ${regionQuota.totalMemoryQuota} to ${updateData.totalMemoryQuota} (>50% reduction) may affect running sandboxes`,
      )
    }

    if (updateData.totalDiskQuota !== undefined && updateData.totalDiskQuota < regionQuota.totalDiskQuota / 2) {
      warnings.push(
        `Reducing totalDiskQuota from ${regionQuota.totalDiskQuota} to ${updateData.totalDiskQuota} (>50% reduction) may affect running sandboxes`,
      )
    }

    // Warn if setting very low quotas
    if (updateData.totalCpuQuota !== undefined && updateData.totalCpuQuota < 1) {
      warnings.push('totalCpuQuota is less than 1 - this may prevent any sandboxes from being created')
    }

    if (updateData.totalMemoryQuota !== undefined && updateData.totalMemoryQuota < 1) {
      warnings.push('totalMemoryQuota is less than 1GB - this may prevent any sandboxes from being created')
    }

    if (updateData.totalDiskQuota !== undefined && updateData.totalDiskQuota < 1) {
      warnings.push('totalDiskQuota is less than 1GB - this may prevent any sandboxes from being created')
    }

    // Per-sandbox caps shouldn't exceed the region total
    const maxCpu = updateData.maxCpuPerSandbox ?? regionQuota.maxCpuPerSandbox
    const totalCpu = updateData.totalCpuQuota ?? regionQuota.totalCpuQuota
    if (maxCpu != null && maxCpu > totalCpu) {
      warnings.push(`maxCpuPerSandbox (${maxCpu}) exceeds totalCpuQuota (${totalCpu}); the lower bound applies`)
    }

    const maxMem = updateData.maxMemoryPerSandbox ?? regionQuota.maxMemoryPerSandbox
    const totalMem = updateData.totalMemoryQuota ?? regionQuota.totalMemoryQuota
    if (maxMem != null && maxMem > totalMem) {
      warnings.push(`maxMemoryPerSandbox (${maxMem}) exceeds totalMemoryQuota (${totalMem}); the lower bound applies`)
    }

    const maxDisk = updateData.maxDiskPerSandbox ?? regionQuota.maxDiskPerSandbox
    const totalDisk = updateData.totalDiskQuota ?? regionQuota.totalDiskQuota
    if (maxDisk != null && maxDisk > totalDisk) {
      warnings.push(`maxDiskPerSandbox (${maxDisk}) exceeds totalDiskQuota (${totalDisk}); the lower bound applies`)
    }

    return warnings
  }
}
