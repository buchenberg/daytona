/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { OrganizationMemberRole } from '@api/organization/enums/organization-member-role.enum'
import { BulkUpdateOrganizationUserDto, UpdateOrganizationUserDto } from '../dto'
import { BulkUpdateResponseDto, BulkUpdateResultDto } from '../../common/dto'

@Injectable()
export class OrganizationUsersBulkService {
  constructor(
    @InjectRepository(OrganizationUser)
    private readonly memberRepository: Repository<OrganizationUser>,
  ) {}

  /**
   * Perform bulk update on organization users
   * IDs are in format "organizationId:userId"
   */
  async bulkUpdate(request: BulkUpdateOrganizationUserDto): Promise<BulkUpdateResponseDto> {
    const { ids, updates, dryRun = false } = request

    // Parse composite IDs
    const compositeIds = ids.map((id: any) => {
      const organizationId = typeof id === 'string' ? id.split(':')[0] : id.organizationId
      const userId = typeof id === 'string' ? id.split(':')[1] : id.userId
      if (!organizationId || !userId) {
        throw new Error(
          `Invalid composite ID format: ${JSON.stringify(id)}. Expected format: "organizationId:userId" or {organizationId, userId}`,
        )
      }
      const compositeId = typeof id === 'string' ? id : `${id.organizationId}:${id.userId}`
      return { organizationId, userId, compositeId }
    })

    // Fetch all members
    const members = await Promise.all(
      compositeIds.map(async ({ organizationId, userId }) => {
        const member = await this.memberRepository.findOne({
          where: { organizationId, userId },
        })
        return member ? { member, organizationId, userId } : null
      }),
    )

    const validMembers = members.filter((m) => m !== null) as Array<{
      member: OrganizationUser
      organizationId: string
      userId: string
    }>

    if (validMembers.length === 0) {
      throw new Error('No organization users found with the provided IDs')
    }

    const results: BulkUpdateResponseDto['results'] = []
    const warnings: string[] = []
    let successCount = 0
    let failureCount = 0

    // Process each member
    for (const { member, organizationId, userId } of validMembers) {
      const compositeId = `${organizationId}:${userId}`

      try {
        const preview = this.previewChanges(member, updates)

        if (dryRun) {
          results.push({
            id: compositeId,
            success: true,
            data: preview,
          })
          successCount++
        } else {
          // Apply updates - only copy defined properties
          this.memberRepository.merge(member, updates)
          await this.memberRepository.save(member)

          results.push({
            id: compositeId,
            success: true,
            data: preview,
          })
          successCount++

          // Collect warnings
          const itemWarnings = await this.generateWarnings(member, updates)
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
  private previewChanges(member: OrganizationUser, updates: UpdateOrganizationUserDto): Record<string, any> {
    const ALLOWED_KEYS: (keyof UpdateOrganizationUserDto)[] = ['role']
    const changes: Record<string, any> = {}

    for (const key of ALLOWED_KEYS) {
      if (key in updates) {
        changes[key] = {
          from: member[key],
          to: updates[key],
        }
      }
    }

    return changes
  }

  /**
   * Generate warnings for the updates
   */
  private async generateWarnings(member: OrganizationUser, updates: UpdateOrganizationUserDto): Promise<string[]> {
    const warnings: string[] = []

    // Warn if removing OWNER role
    if (updates.role && member.role === OrganizationMemberRole.OWNER && updates.role !== OrganizationMemberRole.OWNER) {
      // Check if this is the last owner
      const ownerCount = await this.memberRepository.count({
        where: {
          organizationId: member.organizationId,
          role: OrganizationMemberRole.OWNER,
        },
      })

      if (ownerCount === 1) {
        warnings.push(
          `WARNING: Removing last OWNER from organization ${member.organizationId}. This organization will have no owners!`,
        )
      }
    }

    return warnings
  }
}
