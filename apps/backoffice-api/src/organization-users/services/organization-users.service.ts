/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { OrganizationMemberRole } from '@api/organization/enums/organization-member-role.enum'
import { UpdateOrganizationUserDto } from '../dto/update-organization-user.dto'
import { PatchOrganizationUserDto } from '../dto/patch-organization-user.dto'
import { updateWithPreconditions } from '../../common/preconditions.util'

@Injectable()
export class OrganizationUsersService {
  constructor(
    @InjectRepository(OrganizationUser)
    private readonly memberRepository: Repository<OrganizationUser>,
  ) {}

  /**
   * Update a single organization user
   */
  async update(
    organizationId: string,
    userId: string,
    patchData: PatchOrganizationUserDto,
    updatedBy: string,
  ): Promise<{ member: OrganizationUser; warnings: string[] }> {
    const member = await this.memberRepository.findOne({
      where: { organizationId, userId },
    })

    if (!member) {
      throw new Error('Organization member not found')
    }

    const updateData = patchData.updates

    const warnings = await this.validateUpdate(member, updateData)

    // Atomic update: UPDATE ... SET updates WHERE orgId = ? AND userId = ? AND preconditions
    const updated = await updateWithPreconditions(
      this.memberRepository,
      { organizationId, userId },
      updateData,
      patchData.preconditions,
    )

    return { member: updated, warnings }
  }

  /**
   * Validate organization user updates and return warnings
   */
  private async validateUpdate(member: OrganizationUser, updateData: UpdateOrganizationUserDto): Promise<string[]> {
    const warnings: string[] = []

    // Warn if removing OWNER role
    if (member.role === OrganizationMemberRole.OWNER && updateData.role !== OrganizationMemberRole.OWNER) {
      // Check if this is the last owner
      const ownerCount = await this.memberRepository.count({
        where: {
          organizationId: member.organizationId,
          role: OrganizationMemberRole.OWNER,
        },
      })

      if (ownerCount === 1) {
        warnings.push(
          'WARNING: Removing the last OWNER role from this organization. The organization will have no owners!',
        )
      }
    }

    return warnings
  }
}
