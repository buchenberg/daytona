/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Organization } from '@api/organization/entities/organization.entity'
import { UpdateOrganizationDto, PatchOrganizationDto } from '../dto'
import { updateWithPreconditions } from '../../common/preconditions.util'

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  /**
   * Update a single organization
   */
  async update(
    id: string,
    patchData: PatchOrganizationDto,
  ): Promise<{ organization: Organization; warnings: string[] }> {
    const organization = await this.organizationRepository.findOne({ where: { id } })

    if (!organization) {
      throw new Error('Organization not found')
    }

    const updateData = patchData.updates

    const warnings = this.validateUpdate(organization, updateData)

    // Validate name uniqueness if changing
    if (updateData.name && updateData.name !== organization.name) {
      const existing = await this.organizationRepository.findOne({ where: { name: updateData.name } })
      if (existing) {
        throw new Error(`Organization with name "${updateData.name}" already exists`)
      }
    }

    // Atomic update: UPDATE ... SET updates WHERE id = ? AND preconditions
    const updated = await updateWithPreconditions(
      this.organizationRepository,
      { id },
      updateData,
      patchData.preconditions,
    )

    return { organization: updated, warnings }
  }

  /**
   * Validate organization updates and return warnings
   */
  private validateUpdate(organization: Organization, updateData: UpdateOrganizationDto): string[] {
    const warnings: string[] = []

    // Warn if suspending an active organization
    if (updateData.suspended === true && !organization.suspended) {
      warnings.push('Suspending this organization will prevent all users from accessing their sandboxes')
    }

    // Warn if unsuspending with a future suspendedUntil date
    if (
      updateData.suspended === false &&
      organization.suspendedUntil &&
      new Date(organization.suspendedUntil) > new Date()
    ) {
      warnings.push('Organization has a future suspendedUntil date which may auto-suspend it again')
    }

    // Note: Quota consistency is now handled at the region level via RegionQuota table

    // Warn if disabling telemetry
    if (updateData.telemetryEnabled === false && organization.telemetryEnabled) {
      warnings.push('Disabling telemetry will prevent monitoring and usage tracking for this organization')
    }

    return warnings
  }
}
