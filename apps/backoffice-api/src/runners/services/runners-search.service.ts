/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { plainToInstance } from 'class-transformer'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { SearchRunnerDto, RunnerFiltersDto, RunnerResponseDto } from '../dto'
import { applyRangeFilter } from '../../common/utils'

const SORT_FIELD_MAP: Record<string, string> = {
  domain: 'runner.domain',
  region: 'runner.region',
  state: 'runner.state',
  class: 'runner.class',
  availabilityScore: 'runner.availabilityScore',
  currentCpuUsagePercentage: 'runner.currentCpuUsagePercentage',
  currentMemoryUsagePercentage: 'runner.currentMemoryUsagePercentage',
  createdAt: 'runner.createdAt',
  updatedAt: 'runner.updatedAt',
  lastChecked: 'runner.lastChecked',
}

export interface RunnerSearchResult {
  success: boolean
  data: {
    runners: RunnerResponseDto[]
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

@Injectable()
export class RunnersSearchService {
  constructor(
    @InjectRepository(Runner)
    private readonly runnersRepository: Repository<Runner>,
  ) {}

  async search(requestDto: SearchRunnerDto): Promise<RunnerSearchResult> {
    const {
      filters = {},
      pagination = { page: 1, pageSize: 25 },
      sort = { field: 'createdAt', order: 'desc' },
    } = requestDto

    const queryBuilder = this.runnersRepository.createQueryBuilder('runner')

    this.applyFilters(queryBuilder, filters)

    // Apply sorting with validation
    const sortColumn = SORT_FIELD_MAP[sort.field || 'createdAt']
    if (!sortColumn) {
      throw new BadRequestException(`Invalid sort field: ${sort.field}`)
    }
    const sortOrder = sort.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    queryBuilder.orderBy(sortColumn, sortOrder, 'NULLS LAST')
    if (sortColumn !== 'runner.createdAt') {
      queryBuilder.addOrderBy('runner.createdAt', 'DESC')
    }

    // Apply pagination
    const page = pagination.page || 1
    const pageSize = pagination.pageSize || 25
    const skip = (page - 1) * pageSize

    queryBuilder.skip(skip).take(pageSize)

    // Execute query
    const [runners, total] = await queryBuilder.getManyAndCount()

    return {
      success: true,
      data: {
        runners: runners.map((r) => plainToInstance(RunnerResponseDto, r, { excludeExtraneousValues: true })),
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<Runner>, filters: RunnerFiltersDto): void {
    if (filters.search) {
      queryBuilder.andWhere('(runner.domain ILIKE :search OR CAST(runner.id AS TEXT) ILIKE :search)', {
        search: `%${filters.search}%`,
      })
    }

    if (filters.region) {
      queryBuilder.andWhere('runner.region = :region', { region: filters.region })
    }

    if (filters.state && filters.state.length > 0) {
      queryBuilder.andWhere('runner.state IN (:...states)', { states: filters.state })
    }

    if (filters.class && filters.class.length > 0) {
      queryBuilder.andWhere('runner.class IN (:...classes)', { classes: filters.class })
    }

    if (filters.unschedulable !== undefined) {
      queryBuilder.andWhere('runner.unschedulable = :unschedulable', {
        unschedulable: filters.unschedulable,
      })
    }

    applyRangeFilter(queryBuilder, 'runner.currentCpuUsagePercentage', filters.cpuUsage, 'cpuUsage')
    applyRangeFilter(queryBuilder, 'runner.currentMemoryUsagePercentage', filters.memoryUsage, 'memoryUsage')
    applyRangeFilter(queryBuilder, 'runner.currentDiskUsagePercentage', filters.diskUsage, 'diskUsage')
    applyRangeFilter(queryBuilder, 'runner.availabilityScore', filters.availabilityScore, 'availabilityScore')

    if (filters.lastCheckedAfter) {
      queryBuilder.andWhere('runner.lastChecked >= :lastCheckedAfter', {
        lastCheckedAfter: filters.lastCheckedAfter,
      })
    }

    if (filters.lastCheckedBefore) {
      queryBuilder.andWhere('runner.lastChecked <= :lastCheckedBefore', {
        lastCheckedBefore: filters.lastCheckedBefore,
      })
    }
  }
}
