/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { SearchRegionQuotaDto, RegionQuotaFiltersDto } from '../dto'
import { applyRangeFilter } from '../../common/utils'

const SORT_FIELD_MAP: Record<string, string> = {
  organizationId: 'rq.organizationId',
  regionId: 'rq.regionId',
  totalCpuQuota: 'rq.totalCpuQuota',
  totalMemoryQuota: 'rq.totalMemoryQuota',
  totalDiskQuota: 'rq.totalDiskQuota',
  createdAt: 'rq.createdAt',
  updatedAt: 'rq.updatedAt',
}

export type RegionQuotaWithOrgName = Omit<RegionQuota, 'organization'> & { organizationName: string | null }

export interface RegionQuotaSearchResponseDto {
  success: boolean
  data: {
    regionQuotas: RegionQuotaWithOrgName[]
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

@Injectable()
export class RegionQuotasSearchService {
  constructor(
    @InjectRepository(RegionQuota)
    private readonly regionQuotasRepository: Repository<RegionQuota>,
  ) {}

  async search(requestDto: SearchRegionQuotaDto): Promise<RegionQuotaSearchResponseDto> {
    const {
      filters = {},
      pagination = { page: 1, pageSize: 25 },
      sort = { field: 'createdAt', order: 'desc' },
    } = requestDto

    const queryBuilder = this.regionQuotasRepository.createQueryBuilder('rq')
    queryBuilder.leftJoinAndSelect('rq.organization', 'organization')

    this.applyFilters(queryBuilder, filters)

    // Apply sorting with validation
    const sortColumn = SORT_FIELD_MAP[sort.field || 'createdAt']
    if (!sortColumn) {
      throw new BadRequestException(`Invalid sort field: ${sort.field}`)
    }
    const sortOrder = sort.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    queryBuilder.orderBy(sortColumn, sortOrder, 'NULLS LAST')
    if (sortColumn !== 'rq.createdAt') {
      queryBuilder.addOrderBy('rq.createdAt', 'DESC')
    }

    // Apply pagination
    const page = pagination.page || 1
    const pageSize = pagination.pageSize || 25
    const skip = (page - 1) * pageSize

    queryBuilder.skip(skip).take(pageSize)

    // Execute query
    const [regionQuotas, total] = await queryBuilder.getManyAndCount()

    // Build result objects with organizationName, omitting the relation
    const mappedQuotas: RegionQuotaWithOrgName[] = regionQuotas.map(({ organization, ...rest }) => ({
      ...rest,
      organizationName: organization?.name ?? null,
    }))

    return {
      success: true,
      data: {
        regionQuotas: mappedQuotas,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<RegionQuota>, filters: RegionQuotaFiltersDto): void {
    if (filters.search) {
      queryBuilder.andWhere('(organization.name ILIKE :search OR CAST(rq.organizationId AS TEXT) ILIKE :search)', {
        search: `%${filters.search}%`,
      })
    }

    if (filters.organizationId) {
      queryBuilder.andWhere('rq.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      })
    }

    if (filters.organizationName) {
      queryBuilder.andWhere('organization.name ILIKE :organizationName', {
        organizationName: `%${filters.organizationName}%`,
      })
    }

    if (filters.regionId) {
      queryBuilder.andWhere('rq.regionId = :regionId', { regionId: filters.regionId })
    }

    applyRangeFilter(queryBuilder, 'rq.totalCpuQuota', filters.cpuQuota, 'cpuQuota')
    applyRangeFilter(queryBuilder, 'rq.totalMemoryQuota', filters.memoryQuota, 'memoryQuota')
    applyRangeFilter(queryBuilder, 'rq.totalDiskQuota', filters.diskQuota, 'diskQuota')
  }
}
