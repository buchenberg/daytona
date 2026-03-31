/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { plainToInstance } from 'class-transformer'
import { Organization } from '@api/organization/entities/organization.entity'
import { SearchOrganizationDto, OrganizationFiltersDto, OrganizationResponseDto } from '../dto'

const SORT_FIELD_MAP: Record<string, string> = {
  name: 'organization.name',
  personal: 'organization.personal',
  suspended: 'organization.suspended',
  createdAt: 'organization.createdAt',
  updatedAt: 'organization.updatedAt',
  suspendedAt: 'organization.suspendedAt',
}

export interface OrganizationSearchResult {
  success: boolean
  data: {
    organizations: OrganizationResponseDto[]
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

@Injectable()
export class OrganizationsSearchService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  /**
   * Search organizations with filters, sorting, and pagination
   */
  async search(requestDto: SearchOrganizationDto): Promise<OrganizationSearchResult> {
    const {
      filters = {},
      pagination = { page: 1, pageSize: 25 },
      sort = { field: 'createdAt', order: 'desc' },
    } = requestDto

    const queryBuilder = this.organizationRepository.createQueryBuilder('organization')

    this.applyFilters(queryBuilder, filters)

    // Apply sorting with validation
    const sortColumn = SORT_FIELD_MAP[sort.field || 'createdAt']
    if (!sortColumn) {
      throw new BadRequestException(`Invalid sort field: ${sort.field}`)
    }
    const sortOrder = sort.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    queryBuilder.orderBy(sortColumn, sortOrder, 'NULLS LAST')
    if (sortColumn !== 'organization.createdAt') {
      queryBuilder.addOrderBy('organization.createdAt', 'DESC')
    }

    // Apply pagination
    const page = pagination.page || 1
    const pageSize = pagination.pageSize || 25
    const skip = (page - 1) * pageSize

    queryBuilder.skip(skip).take(pageSize)

    // Execute query
    const [organizations, total] = await queryBuilder.getManyAndCount()

    return {
      success: true,
      data: {
        organizations: organizations.map((o) =>
          plainToInstance(OrganizationResponseDto, o, { excludeExtraneousValues: true }),
        ),
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  /**
   * Apply filters to the query builder
   */
  private applyFilters(queryBuilder: SelectQueryBuilder<Organization>, filters: OrganizationFiltersDto): void {
    if (filters.search) {
      queryBuilder.andWhere('(organization.name ILIKE :search OR CAST(organization.id AS TEXT) ILIKE :search)', {
        search: `%${filters.search}%`,
      })
    }

    if (filters.name) {
      queryBuilder.andWhere('organization.name ILIKE :name', { name: `%${filters.name}%` })
    }

    if (filters.personal !== undefined) {
      queryBuilder.andWhere('organization.personal = :personal', { personal: filters.personal })
    }

    if (filters.suspended !== undefined) {
      queryBuilder.andWhere('organization.suspended = :suspended', { suspended: filters.suspended })
    }

    if (filters.telemetryEnabled !== undefined) {
      queryBuilder.andWhere('organization.telemetryEnabled = :telemetryEnabled', {
        telemetryEnabled: filters.telemetryEnabled,
      })
    }

    if (filters.createdBy) {
      queryBuilder.andWhere('organization.createdBy = :createdBy', { createdBy: filters.createdBy })
    }

    if (filters.createdAfter) {
      queryBuilder.andWhere('organization.createdAt >= :createdAfter', { createdAfter: filters.createdAfter })
    }

    if (filters.createdBefore) {
      queryBuilder.andWhere('organization.createdAt <= :createdBefore', { createdBefore: filters.createdBefore })
    }

    if (filters.suspendedAfter) {
      queryBuilder.andWhere('organization.suspendedAt >= :suspendedAfter', { suspendedAfter: filters.suspendedAfter })
    }

    if (filters.suspendedBefore) {
      queryBuilder.andWhere('organization.suspendedAt <= :suspendedBefore', {
        suspendedBefore: filters.suspendedBefore,
      })
    }
  }
}
