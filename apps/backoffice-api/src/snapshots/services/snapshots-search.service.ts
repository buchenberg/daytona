/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { plainToInstance } from 'class-transformer'
import { Snapshot } from '@api/sandbox/entities/snapshot.entity'
import { SearchSnapshotDto, SnapshotFiltersDto, SnapshotResponseDto } from '../dto'
import { applyRangeFilter } from '../../common/utils'

const SORT_FIELD_MAP: Record<string, string> = {
  name: 'snapshot.name',
  state: 'snapshot.state',
  size: 'snapshot.size',
  cpu: 'snapshot.cpu',
  mem: 'snapshot.mem',
  disk: 'snapshot.disk',
  createdAt: 'snapshot.createdAt',
  updatedAt: 'snapshot.updatedAt',
  lastUsedAt: 'snapshot.lastUsedAt',
}

export interface SnapshotSearchResult {
  success: boolean
  data: {
    snapshots: SnapshotResponseDto[]
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

@Injectable()
export class SnapshotsSearchService {
  constructor(
    @InjectRepository(Snapshot)
    private readonly snapshotsRepository: Repository<Snapshot>,
  ) {}

  async search(requestDto: SearchSnapshotDto): Promise<SnapshotSearchResult> {
    const {
      filters = {},
      pagination = { page: 1, pageSize: 25 },
      sort = { field: 'createdAt', order: 'desc' },
    } = requestDto

    const queryBuilder = this.snapshotsRepository.createQueryBuilder('snapshot')

    this.applyFilters(queryBuilder, filters)

    // Apply sorting with validation
    const sortColumn = SORT_FIELD_MAP[sort.field || 'createdAt']
    if (!sortColumn) {
      throw new BadRequestException(`Invalid sort field: ${sort.field}`)
    }
    const sortOrder = sort.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    queryBuilder.orderBy(sortColumn, sortOrder, 'NULLS LAST')
    if (sortColumn !== 'snapshot.createdAt') {
      queryBuilder.addOrderBy('snapshot.createdAt', 'DESC')
    }

    // Apply pagination
    const page = pagination.page || 1
    const pageSize = pagination.pageSize || 25
    const skip = (page - 1) * pageSize

    queryBuilder.skip(skip).take(pageSize)

    // Execute query
    const [snapshots, total] = await queryBuilder.getManyAndCount()

    return {
      success: true,
      data: {
        snapshots: snapshots.map((s) => plainToInstance(SnapshotResponseDto, s, { excludeExtraneousValues: true })),
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<Snapshot>, filters: SnapshotFiltersDto): void {
    if (filters.organizationId) {
      queryBuilder.andWhere('snapshot.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      })
    }

    if (filters.name) {
      queryBuilder.andWhere('snapshot.name ILIKE :name', {
        name: `%${filters.name}%`,
      })
    }

    if (filters.state && filters.state.length > 0) {
      queryBuilder.andWhere('snapshot.state IN (:...states)', { states: filters.state })
    }

    if (filters.general !== undefined) {
      queryBuilder.andWhere('snapshot.general = :general', { general: filters.general })
    }

    if (filters.hideFromUsers !== undefined) {
      queryBuilder.andWhere('snapshot.hideFromUsers = :hideFromUsers', {
        hideFromUsers: filters.hideFromUsers,
      })
    }

    if (filters.hasError !== undefined) {
      if (filters.hasError) {
        queryBuilder.andWhere('snapshot.errorReason IS NOT NULL')
      } else {
        queryBuilder.andWhere('snapshot.errorReason IS NULL')
      }
    }

    applyRangeFilter(queryBuilder, 'snapshot.size', filters.size, 'size')

    if (filters.createdAfter) {
      queryBuilder.andWhere('snapshot.createdAt >= :createdAfter', {
        createdAfter: filters.createdAfter,
      })
    }

    if (filters.createdBefore) {
      queryBuilder.andWhere('snapshot.createdAt <= :createdBefore', {
        createdBefore: filters.createdBefore,
      })
    }

    if (filters.lastUsedAfter) {
      queryBuilder.andWhere('snapshot.lastUsedAt >= :lastUsedAfter', {
        lastUsedAfter: filters.lastUsedAfter,
      })
    }

    if (filters.lastUsedBefore) {
      queryBuilder.andWhere('snapshot.lastUsedAt <= :lastUsedBefore', {
        lastUsedBefore: filters.lastUsedBefore,
      })
    }
  }
}
