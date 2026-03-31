/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../entities/user.entity'
import {
  UserDeletionPreviewDto,
  OrganizationPreviewDto,
  SandboxPreviewDto,
  SnapshotPreviewDto,
} from '../dto/user-deletion-preview.dto'

@Injectable()
export class UserDeletionPreviewService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async preview(userId: string): Promise<UserDeletionPreviewDto> {
    // Find the user
    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    // Query organizations where user is owner
    const orgQuery = `
      SELECT o.id, o.name, ou.role
      FROM organization o
      INNER JOIN organization_user ou ON o.id = ou."organizationId"
      WHERE ou."userId" = $1 AND ou.role = 'owner'
    `
    const organizations: OrganizationPreviewDto[] = await this.userRepository.query(orgQuery, [userId])

    const orgIds = organizations.map((org) => org.id)

    let sandboxes: SandboxPreviewDto[] = []
    let snapshots: SnapshotPreviewDto[] = []
    let apiKeys = 0
    let sandboxTemplates = 0

    if (orgIds.length > 0) {
      // Query sandboxes in owned organizations
      const sandboxQuery = `
        SELECT id, name, state
        FROM sandbox
        WHERE "organizationId" = ANY($1)
        LIMIT 100
      `
      sandboxes = await this.userRepository.query(sandboxQuery, [orgIds])

      // Query snapshots in owned organizations
      const snapshotQuery = `
        SELECT id, name, state
        FROM snapshot
        WHERE "organizationId" = ANY($1)
        LIMIT 100
      `
      snapshots = await this.userRepository.query(snapshotQuery, [orgIds])

      // Count API keys (optional table)
      try {
        const apiKeyResult = await this.userRepository.query(
          `SELECT COUNT(*) as count FROM api_key WHERE "organizationId" = ANY($1)`,
          [orgIds],
        )
        apiKeys = parseInt(apiKeyResult[0]?.count || '0', 10)
      } catch (error) {
        // Table might not exist, default to 0
        apiKeys = 0
      }

      // Count sandbox templates (optional table)
      try {
        const templateResult = await this.userRepository.query(
          `SELECT COUNT(*) as count FROM sandbox_template WHERE "organizationId" = ANY($1)`,
          [orgIds],
        )
        sandboxTemplates = parseInt(templateResult[0]?.count || '0', 10)
      } catch (error) {
        // Table might not exist, default to 0
        sandboxTemplates = 0
      }
    }

    const estimatedImpact = this.generateImpactDescription(
      organizations.length,
      sandboxes.length,
      snapshots.length,
      apiKeys,
      sandboxTemplates,
    )

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      organizations,
      sandboxes,
      snapshots,
      apiKeys,
      sandboxTemplates,
      estimatedImpact,
    }
  }

  private generateImpactDescription(
    orgCount: number,
    sandboxCount: number,
    snapshotCount: number,
    apiKeyCount: number,
    templateCount: number,
  ): string {
    const impacts: string[] = []

    if (orgCount > 0) {
      impacts.push(`${orgCount} organization(s) will be anonymized`)
    }
    if (sandboxCount > 0) {
      impacts.push(`${sandboxCount} sandbox(es) will be destroyed`)
    }
    if (snapshotCount > 0) {
      impacts.push(`${snapshotCount} snapshot(s) will be deactivated`)
    }
    if (apiKeyCount > 0) {
      impacts.push(`${apiKeyCount} API key(s) can be optionally deleted`)
    }
    if (templateCount > 0) {
      impacts.push(`${templateCount} sandbox template(s) can be optionally deleted`)
    }

    return impacts.length > 0 ? impacts.join('; ') : 'No significant resources affected'
  }
}
