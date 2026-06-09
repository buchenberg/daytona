/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, NotFoundException, BadGatewayException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { OpensearchService } from '../../tools/opensearch/opensearch.service'
import {
  SANDBOX_SYNC_DIFF_FIELDS,
  SandboxSyncDiffEntryDto,
  SandboxSyncDiffField,
  SandboxSyncStatusResponseDto,
} from '../dto/sandbox-sync-status.dto'

const UNSET = '<unset>'

@Injectable()
export class SandboxSyncStatusService {
  private readonly logger = new Logger(SandboxSyncStatusService.name)

  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepository: Repository<Sandbox>,
    private readonly opensearchService: OpensearchService,
    private readonly configService: ConfigService,
  ) {}

  async inspect(sandboxId: string): Promise<SandboxSyncStatusResponseDto> {
    const sandbox = await this.sandboxRepository.findOne({
      where: { id: sandboxId },
      relations: ['lastActivityAt'],
    })

    if (!sandbox) {
      throw new NotFoundException(`Sandbox ${sandboxId} not found`)
    }

    const indexName = this.resolveIndexName()

    let osLookup: { found: boolean; source: Record<string, unknown> | null }
    try {
      osLookup = await this.opensearchService.getDocument(indexName, sandboxId)
    } catch (err) {
      this.logger.error(
        `OpenSearch lookup failed for sandbox ${sandboxId} (index: ${indexName}): ${err instanceof Error ? err.message : String(err)}`,
      )
      throw new BadGatewayException('OpenSearch lookup failed')
    }

    const diff = this.buildDiff(sandbox, osLookup.source, osLookup.found)
    const inSync = osLookup.found && diff.every((entry) => entry.status === 'match')

    return {
      sandboxId: sandbox.id,
      organizationId: sandbox.organizationId,
      fetchedAt: new Date().toISOString(),
      osDocumentFound: osLookup.found,
      inSync,
      diff,
      db: this.serializeSandbox(sandbox),
      opensearch: osLookup.source,
    }
  }

  private resolveIndexName(): string {
    const value = this.configService.get<string>('sandboxSearch.publish.opensearchIndexName')
    if (!value) {
      throw new Error('sandboxSearch.publish.opensearchIndexName is not configured')
    }
    return value
  }

  private buildDiff(
    sandbox: Sandbox,
    osSource: Record<string, unknown> | null,
    osDocumentFound: boolean,
  ): SandboxSyncDiffEntryDto[] {
    return SANDBOX_SYNC_DIFF_FIELDS.map((field) => {
      const dbValue = this.normalizeDbValue(sandbox, field)
      const osValue = osDocumentFound ? this.normalizeOsValue(osSource, field) : null
      const status = osDocumentFound && dbValue === osValue ? 'match' : 'mismatch'
      return { field, dbValue, osValue, status }
    })
  }

  private normalizeDbValue(sandbox: Sandbox, field: SandboxSyncDiffField): string {
    switch (field) {
      case 'state':
        return this.normalizeString(sandbox.state)
      case 'desiredState':
        return this.normalizeString(sandbox.desiredState)
      case 'lastActivityAt':
        return this.normalizeDate(sandbox.lastActivityAt?.lastActivityAt)
      case 'errorReason':
        return this.normalizeString(sandbox.errorReason)
      case 'backupState':
        return this.normalizeString(sandbox.backupState)
    }
  }

  private normalizeOsValue(osSource: Record<string, unknown> | null, field: SandboxSyncDiffField): string {
    if (!osSource) return UNSET
    const raw = osSource[field]
    if (field === 'lastActivityAt') {
      return this.normalizeDate(raw)
    }
    return this.normalizeString(raw)
  }

  private normalizeString(value: unknown): string {
    if (value === null || value === undefined) return UNSET
    const stringValue = String(value)
    if (stringValue.trim() === '') return UNSET
    return stringValue
  }

  private normalizeDate(value: unknown): string {
    if (value === null || value === undefined) return UNSET
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? UNSET : value.toISOString()
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? UNSET : parsed.toISOString()
    }
    return UNSET
  }

  private serializeSandbox(sandbox: Sandbox): Record<string, unknown> {
    return JSON.parse(JSON.stringify(sandbox))
  }
}
