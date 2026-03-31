/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { BulkUpdateRegionQuotaDto, UpdateRegionQuotaDto } from '../dto'
import { BulkUpdateResponseDto, BulkUpdateResultDto } from '../../common/dto'
@Injectable()
export class RegionQuotasBulkService {
  constructor(
    @InjectRepository(RegionQuota)
    private readonly regionQuotaRepository: Repository<RegionQuota>,
  ) {}

  /**
   * Perform bulk update on region quotas
   */
  async bulkUpdate(request: BulkUpdateRegionQuotaDto): Promise<BulkUpdateResponseDto> {
    const { ids, updates, dryRun = false } = request

    // Parse composite keys (format: "organizationId:regionId")
    const compositeKeys = ids.map((id: any) => {
      const organizationId = typeof id === 'string' ? id.split(':')[0] : id.organizationId
      const regionId = typeof id === 'string' ? id.split(':')[1] : id.region
      if (!organizationId || !regionId) {
        throw new Error(`Invalid composite key format: ${id}. Expected format: "organizationId:regionId"`)
      }
      return { organizationId, regionId }
    })

    // Fetch all region quotas
    const regionQuotas: RegionQuota[] = []
    for (const key of compositeKeys) {
      const quota = await this.regionQuotaRepository.findOne({
        where: {
          organizationId: key.organizationId,
          regionId: key.regionId,
        },
        relations: ['organization'],
      })
      if (quota) {
        regionQuotas.push(quota)
      }
    }

    if (regionQuotas.length === 0) {
      throw new Error('No region quotas found with the provided IDs')
    }

    const results: BulkUpdateResponseDto['results'] = []
    const warnings: string[] = []
    let successCount = 0
    let failureCount = 0

    // Process each region quota
    for (const regionQuota of regionQuotas) {
      const compositeId = `${regionQuota.organizationId}:${regionQuota.regionId}`
      try {
        const preview = this.previewChanges(regionQuota, updates)

        if (dryRun) {
          results.push({
            id: compositeId,
            success: true,
            data: preview,
          })
          successCount++
        } else {
          // Apply updates - only copy defined properties
          this.regionQuotaRepository.merge(regionQuota, updates)
          await this.regionQuotaRepository.save(regionQuota)

          results.push({
            id: compositeId,
            success: true,
            data: preview,
          })
          successCount++

          // Collect warnings
          const itemWarnings = this.generateWarnings(regionQuota, updates)
          warnings.push(...itemWarnings)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          id: compositeId,
          success: false,
          error: { code: 'UPDATE_FAILED', message: errorMessage },
        })
        failureCount++
      }
    }

    return {
      totalProcessed: ids.length,
      successCount,
      failureCount,
      results,
      warnings: warnings.length > 0 ? Array.from(new Set(warnings)) : undefined,
    }
  }

  /**
   * Preview what changes would be made
   */
  private previewChanges(regionQuota: RegionQuota, updates: UpdateRegionQuotaDto): Record<string, any> {
    const ALLOWED_KEYS: (keyof UpdateRegionQuotaDto)[] = ['totalCpuQuota', 'totalMemoryQuota', 'totalDiskQuota']
    const changes: Record<string, any> = {}

    for (const key of ALLOWED_KEYS) {
      if (key in updates) {
        changes[key] = {
          from: regionQuota[key],
          to: updates[key],
        }
      }
    }

    return changes
  }

  /**
   * Generate warnings for specific updates
   */
  private generateWarnings(regionQuota: RegionQuota, updates: UpdateRegionQuotaDto): string[] {
    const warnings: string[] = []
    const compositeId = `${regionQuota.organizationId}:${regionQuota.regionId}`

    // Warn about significant quota reductions
    for (const field of ['totalCpuQuota', 'totalMemoryQuota', 'totalDiskQuota'] as const) {
      if (updates[field] !== undefined) {
        const currentValue = regionQuota[field]
        const newValue = updates[field]!

        if (newValue < currentValue / 2) {
          warnings.push(
            `${compositeId}: Reducing ${field} from ${currentValue} to ${newValue} (>50% reduction) may affect running sandboxes`,
          )
        }

        if (newValue < 1) {
          warnings.push(
            `${compositeId}: ${field} will be less than 1 - this may prevent any sandboxes from being created`,
          )
        }
      }
    }

    return warnings
  }
}
