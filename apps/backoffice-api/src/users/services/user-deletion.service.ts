/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { User } from '../entities/user.entity'
import { UserDeletionRequestDto } from '../dto/user-deletion-request.dto'
import { UserDeletionResponseDto, ExecutedActionsDto, ManualStepDto } from '../dto/user-deletion-response.dto'

@Injectable()
export class UserDeletionService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async deleteUser(userId: string, requestDto: UserDeletionRequestDto): Promise<UserDeletionResponseDto> {
    // Verify user exists
    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    const executedActions: ExecutedActionsDto = {
      sandboxesDestroyed: 0,
      snapshotsDeactivated: 0,
      organizationsAnonymized: 0,
      userAnonymized: false,
    }

    const warnings: string[] = []

    // Execute deletion within transaction
    await this.dataSource.transaction(async (manager) => {
      // Find organizations where user is owner
      const orgQuery = `
        SELECT o.id
        FROM organization o
        INNER JOIN organization_user ou ON o.id = ou."organizationId"
        WHERE ou."userId" = $1 AND ou.role = 'owner'
      `
      const organizations = await manager.query(orgQuery, [userId])
      const orgIds = organizations.map((org: any) => org.id)

      if (orgIds.length > 0) {
        // Soft delete: Destroy sandboxes (set desiredState to 'destroyed')
        const sandboxResult = await manager.query(
          `UPDATE sandbox SET "desiredState" = 'destroyed' WHERE "organizationId" = ANY($1)`,
          [orgIds],
        )
        executedActions.sandboxesDestroyed = sandboxResult[1] || 0

        // Soft delete: Deactivate snapshots (set state to 'inactive')
        const snapshotResult = await manager.query(
          `UPDATE snapshot SET state = 'inactive' WHERE "organizationId" = ANY($1)`,
          [orgIds],
        )
        executedActions.snapshotsDeactivated = snapshotResult[1] || 0

        // Anonymize organizations (set name to 'DELETED')
        const orgResult = await manager.query(`UPDATE organization SET name = 'DELETED' WHERE id = ANY($1)`, [orgIds])
        executedActions.organizationsAnonymized = orgResult[1] || 0

        // Optional: Delete sandbox templates (if table exists)
        if (requestDto.options?.deleteSandboxTemplates) {
          try {
            const templateResult = await manager.query(
              `DELETE FROM sandbox_template WHERE "organizationId" = ANY($1)`,
              [orgIds],
            )
            executedActions.sandboxTemplatesDeleted = templateResult[1] || 0
          } catch (error) {
            // Table might not exist
            executedActions.sandboxTemplatesDeleted = 0
          }
        }

        // Optional: Delete API keys (if table exists)
        if (requestDto.options?.deleteApiKeys) {
          try {
            const apiKeyResult = await manager.query(`DELETE FROM api_key WHERE "organizationId" = ANY($1)`, [orgIds])
            executedActions.apiKeysDeleted = apiKeyResult[1] || 0
          } catch (error) {
            // Table might not exist
            executedActions.apiKeysDeleted = 0
          }
        }
      }

      // Optional: Delete organization memberships
      if (requestDto.options?.deleteOrgMemberships) {
        const membershipResult = await manager.query(`DELETE FROM organization_user WHERE "userId" = $1`, [userId])
        executedActions.membershipsDeleted = membershipResult[1] || 0
      }

      // Anonymize user by changing ID and email
      // The ID change makes the old user ID invalid (user effectively "disappears")
      // But the record stays in DB for audit trail and referential integrity
      await manager.query(`UPDATE "user" SET email = 'DELETED', id = 'DELETED_' || id WHERE id = $1`, [userId])
      executedActions.userAnonymized = true
    })

    // Generate manual steps for external services
    const manualSteps: ManualStepDto[] = [
      {
        service: 'Auth0',
        instruction: 'Delete user from Auth0 > User Management > Users',
        identifier: userId,
      },
      {
        service: 'Lago',
        instruction: 'Delete customer from Lago > Customers',
        identifier: `User ID: ${userId}`,
      },
      {
        service: 'PostHog',
        instruction: "Set 'Email address' and 'name' properties to 'DELETED' in PostHog > Persons",
        identifier: `User ID: ${userId}`,
      },
    ]

    if (!requestDto.options?.deleteSandboxTemplates) {
      warnings.push('Sandbox templates were not deleted. They remain in the database.')
    }
    if (!requestDto.options?.deleteApiKeys) {
      warnings.push('API keys were not deleted. They remain in the database.')
    }
    if (!requestDto.options?.deleteOrgMemberships) {
      warnings.push('Organization memberships were not deleted. They remain in the database.')
    }

    warnings.push(`User ID changed from '${userId}' to 'DELETED_${userId}'. Old ID is now invalid.`)

    return {
      success: true,
      executedActions,
      manualSteps,
      warnings,
    }
  }
}
