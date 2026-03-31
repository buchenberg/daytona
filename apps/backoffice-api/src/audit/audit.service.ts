/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditLog } from '../backoffice-db/entities/audit-log.entity'
import {
  SearchAuditLogsDto,
  AuditLogSearchResponseDto,
  CreateAuditLogInternalDto,
  UpdateAuditLogInternalDto,
} from './dto'

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(
    @InjectRepository(AuditLog, 'backoffice')
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async createLog(createDto: CreateAuditLogInternalDto): Promise<AuditLog> {
    const auditLog = new AuditLog()
    auditLog.actorId = createDto.actorId
    auditLog.actorEmail = createDto.actorEmail
    auditLog.action = createDto.action
    auditLog.targetType = createDto.targetType
    auditLog.targetId = createDto.targetId
    auditLog.statusCode = createDto.statusCode
    auditLog.errorMessage = createDto.errorMessage
    auditLog.ipAddress = createDto.ipAddress
    auditLog.userAgent = createDto.userAgent
    auditLog.metadata = createDto.metadata

    return this.auditLogRepository.save(auditLog)
  }

  async updateLog(id: string, updateDto: UpdateAuditLogInternalDto): Promise<AuditLog> {
    const auditLog = await this.auditLogRepository.findOne({ where: { id } })
    if (!auditLog) {
      throw new NotFoundException(`Audit log with ID ${id} not found`)
    }

    if (updateDto.statusCode !== undefined) {
      auditLog.statusCode = updateDto.statusCode
    }

    if (updateDto.errorMessage !== undefined) {
      auditLog.errorMessage = updateDto.errorMessage
    }

    if (updateDto.targetId !== undefined) {
      auditLog.targetId = updateDto.targetId
    }

    return this.auditLogRepository.save(auditLog)
  }

  async search(dto: SearchAuditLogsDto): Promise<AuditLogSearchResponseDto> {
    const { page = 1, pageSize = 20, filters } = dto
    const query = this.auditLogRepository.createQueryBuilder('audit')

    // Apply filters
    if (filters?.actorEmail) {
      query.andWhere('audit.actorEmail ILIKE :email', { email: `%${filters.actorEmail}%` })
    }
    if (filters?.action) {
      query.andWhere('audit.action = :action', { action: filters.action })
    }
    if (filters?.targetType) {
      query.andWhere('audit.targetType = :targetType', { targetType: filters.targetType })
    }
    if (filters?.startDate) {
      query.andWhere('audit.createdAt >= :startDate', { startDate: filters.startDate })
    }
    if (filters?.endDate) {
      query.andWhere('audit.createdAt <= :endDate', { endDate: filters.endDate })
    }

    // Pagination
    query.skip((page - 1) * pageSize).take(pageSize)
    query.orderBy('audit.createdAt', 'DESC')

    const [logs, total] = await query.getManyAndCount()

    return {
      success: true,
      data: { logs },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }
}
