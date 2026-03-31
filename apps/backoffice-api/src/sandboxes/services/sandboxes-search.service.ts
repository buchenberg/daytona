/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { plainToInstance } from 'class-transformer'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { SearchSandboxDto, SandboxFiltersDto, SandboxResponseDto } from '../dto'
import { applyRangeFilter } from '../../common/utils'

const SORT_FIELD_MAP: Record<string, string> = {
  name: 'sandbox.name',
  state: 'sandbox.state',
  region: 'sandbox.region',
  cpu: 'sandbox.cpu',
  mem: 'sandbox.mem',
  disk: 'sandbox.disk',
  createdAt: 'sandbox.createdAt',
  updatedAt: 'sandbox.updatedAt',
}

export interface SandboxSearchResult {
  success: boolean
  data: {
    sandboxes: SandboxResponseDto[]
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

@Injectable()
export class SandboxesSearchService {
  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxesRepository: Repository<Sandbox>,
  ) {}

  async search(requestDto: SearchSandboxDto): Promise<SandboxSearchResult> {
    const {
      filters = {},
      pagination = { page: 1, pageSize: 25 },
      sort = { field: 'createdAt', order: 'desc' },
    } = requestDto

    const queryBuilder = this.sandboxesRepository.createQueryBuilder('sandbox')

    this.applyFilters(queryBuilder, filters)

    // Apply sorting with validation
    const sortColumn = SORT_FIELD_MAP[sort.field || 'createdAt']
    if (!sortColumn) {
      throw new BadRequestException(`Invalid sort field: ${sort.field}`)
    }
    const sortOrder = sort.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    queryBuilder.orderBy(sortColumn, sortOrder, 'NULLS LAST')
    if (sortColumn !== 'sandbox.createdAt') {
      queryBuilder.addOrderBy('sandbox.createdAt', 'DESC')
    }

    // Apply pagination
    const page = pagination.page || 1
    const pageSize = pagination.pageSize || 25
    const skip = (page - 1) * pageSize

    queryBuilder.skip(skip).take(pageSize)

    // Execute query
    const [sandboxes, total] = await queryBuilder.getManyAndCount()

    return {
      success: true,
      data: {
        sandboxes: sandboxes.map((s) => plainToInstance(SandboxResponseDto, s, { excludeExtraneousValues: true })),
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<Sandbox>, filters: SandboxFiltersDto): void {
    if (filters.sandboxIds && filters.sandboxIds.length > 0) {
      queryBuilder.andWhere('sandbox.id IN (:...sandboxIds)', { sandboxIds: filters.sandboxIds })
    }

    if (filters.organizationId) {
      queryBuilder.andWhere('sandbox.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      })
    }

    if (filters.search) {
      queryBuilder.andWhere('sandbox.id = :search', {
        search: filters.search,
      })
    }

    if (filters.region) {
      queryBuilder.andWhere('sandbox.region = :region', { region: filters.region })
    }

    if (filters.state && filters.state.length > 0) {
      queryBuilder.andWhere('sandbox.state IN (:...states)', { states: filters.state })
    }

    if (filters.excludeStates && filters.excludeStates.length > 0) {
      queryBuilder.andWhere('sandbox.state NOT IN (:...excludeStates)', {
        excludeStates: filters.excludeStates,
      })
    }

    if (filters.runnerId) {
      queryBuilder.andWhere('sandbox.runnerId = :runnerId', { runnerId: filters.runnerId })
    }

    if (filters.public !== undefined) {
      queryBuilder.andWhere('sandbox.public = :public', { public: filters.public })
    }

    if (filters.errorOnly) {
      queryBuilder.andWhere('sandbox.errorReason IS NOT NULL')
    }

    if (filters.hasError !== undefined) {
      if (filters.hasError) {
        queryBuilder.andWhere('sandbox.errorReason IS NOT NULL')
      } else {
        queryBuilder.andWhere('sandbox.errorReason IS NULL')
      }
    }

    applyRangeFilter(queryBuilder, 'sandbox.cpu', filters.cpu, 'cpu')
    applyRangeFilter(queryBuilder, 'sandbox.mem', filters.memory, 'memory')
    applyRangeFilter(queryBuilder, 'sandbox.disk', filters.disk, 'disk')

    if (filters.createdAfter) {
      queryBuilder.andWhere('sandbox.createdAt >= :createdAfter', {
        createdAfter: filters.createdAfter,
      })
    }

    if (filters.createdBefore) {
      queryBuilder.andWhere('sandbox.createdAt <= :createdBefore', {
        createdBefore: filters.createdBefore,
      })
    }
  }
}
