/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, SelectQueryBuilder } from 'typeorm'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { User } from '@api/user/user.entity'
import { SearchOrganizationUserDto, OrganizationUserFiltersDto } from '../dto'

const SORT_FIELD_MAP: Record<string, string> = {
  organizationId: 'ou.organizationId',
  userId: 'ou.userId',
  role: 'ou.role',
  createdAt: 'ou.createdAt',
  updatedAt: 'ou.updatedAt',
}

export type OrganizationUserWithEmail = Omit<OrganizationUser, 'organization' | 'assignedRoles'> & {
  userEmail?: string
}

export interface OrganizationUserSearchResponseDto {
  success: boolean
  data: {
    organizationUsers: OrganizationUserWithEmail[]
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

@Injectable()
export class OrganizationUsersSearchService {
  constructor(
    @InjectRepository(OrganizationUser)
    private readonly organizationUsersRepository: Repository<OrganizationUser>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async search(requestDto: SearchOrganizationUserDto): Promise<OrganizationUserSearchResponseDto> {
    const {
      filters = {},
      pagination = { page: 1, pageSize: 25 },
      sort = { field: 'createdAt', order: 'desc' },
    } = requestDto

    const queryBuilder = this.organizationUsersRepository.createQueryBuilder('ou')

    this.applyFilters(queryBuilder, filters)

    // Apply sorting with validation
    const sortColumn = SORT_FIELD_MAP[sort.field || 'createdAt']
    if (!sortColumn) {
      throw new BadRequestException(`Invalid sort field: ${sort.field}`)
    }
    const sortOrder = sort.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    queryBuilder.orderBy(sortColumn, sortOrder, 'NULLS LAST')
    if (sortColumn !== 'ou.createdAt') {
      queryBuilder.addOrderBy('ou.createdAt', 'DESC')
    }

    // Apply pagination
    const page = pagination.page || 1
    const pageSize = pagination.pageSize || 25
    const skip = (page - 1) * pageSize

    queryBuilder.skip(skip).take(pageSize)

    // Execute query
    const [organizationUsers, total] = await queryBuilder.getManyAndCount()

    // Fetch emails for all users in result
    const userIds = [...new Set(organizationUsers.map((ou) => ou.userId))]
    const users = userIds.length
      ? await this.usersRepository.find({ where: { id: In(userIds) }, select: ['id', 'email'] })
      : []
    const emailMap = new Map(users.map((u) => [u.id, u.email]))

    const mappedUsers: OrganizationUserWithEmail[] = organizationUsers.map((ou) => {
      const { organization, assignedRoles, ...rest } = ou as OrganizationUser & {
        organization?: unknown
        assignedRoles?: unknown
      }
      return { ...rest, userEmail: emailMap.get(ou.userId) ?? undefined }
    })

    return {
      success: true,
      data: {
        organizationUsers: mappedUsers,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<OrganizationUser>, filters: OrganizationUserFiltersDto): void {
    if (filters.search) {
      queryBuilder.andWhere(
        '(CAST(ou.userId AS TEXT) ILIKE :search OR CAST(ou.organizationId AS TEXT) ILIKE :search)',
        { search: `%${filters.search}%` },
      )
    }

    if (filters.organizationId) {
      queryBuilder.andWhere('ou.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      })
    }

    if (filters.userId) {
      queryBuilder.andWhere('ou.userId = :userId', { userId: filters.userId })
    }

    if (filters.role && filters.role.length > 0) {
      queryBuilder.andWhere('ou.role IN (:...roles)', { roles: filters.role })
    }

    if (filters.createdAfter) {
      queryBuilder.andWhere('ou.createdAt >= :createdAfter', {
        createdAfter: filters.createdAfter,
      })
    }

    if (filters.createdBefore) {
      queryBuilder.andWhere('ou.createdAt <= :createdBefore', {
        createdBefore: filters.createdBefore,
      })
    }
  }
}
