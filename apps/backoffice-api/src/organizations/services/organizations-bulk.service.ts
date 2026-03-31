/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Organization } from '@api/organization/entities/organization.entity'
import { BulkUpdateOrganizationDto, UpdateOrganizationDto } from '../dto'
import { BulkUpdateResponseDto } from '../../common/dto'

@Injectable()
export class OrganizationsBulkService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  /**
   * Perform bulk update on organizations
   */
  async bulkUpdate(request: BulkUpdateOrganizationDto): Promise<BulkUpdateResponseDto> {
    const { ids, updates, dryRun = false } = request

    // Fetch all organizations by IDs
    const organizations = await this.organizationRepository.find({
      where: { id: In(ids) },
    })

    if (organizations.length === 0) {
      throw new Error('No organizations found with the provided IDs')
    }

    const results: BulkUpdateResponseDto['results'] = []
    const warnings: string[] = []
    let successCount = 0
    let failureCount = 0

    // Process each organization
    for (const organization of organizations) {
      try {
        const preview = this.previewChanges(organization, updates)

        if (dryRun) {
          results.push({
            id: organization.id,
            success: true,
            data: preview,
          })
          successCount++
        } else {
          // Apply updates - only copy defined properties
          this.organizationRepository.merge(organization, updates)
          await this.organizationRepository.save(organization)

          results.push({
            id: organization.id,
            success: true,
            data: preview,
          })
          successCount++

          // Collect warnings
          const itemWarnings = this.generateWarnings(organization, updates)
          warnings.push(...itemWarnings)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          id: organization.id,
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
  private previewChanges(organization: Organization, updates: UpdateOrganizationDto): Record<string, any> {
    const ALLOWED_KEYS: (keyof UpdateOrganizationDto)[] = [
      'name',
      'suspended',
      'suspendedUntil',
      'telemetryEnabled',
      'maxCpuPerSandbox',
      'maxMemoryPerSandbox',
      'maxDiskPerSandbox',
      'maxSnapshotSize',
      'snapshotQuota',
      'volumeQuota',
      'sandboxLimitedNetworkEgress',
    ]
    const changes: Record<string, any> = {}

    for (const key of ALLOWED_KEYS) {
      if (key in updates) {
        changes[key] = {
          from: organization[key],
          to: updates[key],
        }
      }
    }

    return changes
  }

  /**
   * Generate warnings for the updates
   */
  private generateWarnings(organization: Organization, updates: UpdateOrganizationDto): string[] {
    const warnings: string[] = []

    // Suspension warnings
    if (updates.suspended === true && !organization.suspended) {
      warnings.push(`Organization "${organization.name}" will be suspended - users will lose access`)
    }

    // Telemetry warnings
    if (updates.telemetryEnabled === false && organization.telemetryEnabled) {
      warnings.push(`Telemetry disabled for "${organization.name}" - monitoring data will be lost`)
    }

    return warnings
  }
}
