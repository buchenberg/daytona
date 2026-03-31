/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../entities/user.entity'
import { SearchUsersDto } from '../dto/search-users.dto'
import { UserSearchResponseDto, UserResponseDto } from '../dto/user-search-response.dto'

const SORT_FIELD_MAP: Record<string, string> = {
  createdAt: 'user.createdAt',
  email: 'user.email',
  name: 'user.name',
  emailVerified: 'user.emailVerified',
}

@Injectable()
export class UsersSearchService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async search(requestDto: SearchUsersDto): Promise<UserSearchResponseDto> {
    const {
      filters = {},
      pagination = { page: 1, pageSize: 25 },
      sort = { field: 'createdAt', order: 'desc' },
    } = requestDto

    const { page, pageSize } = pagination
    const skip = (page - 1) * pageSize

    const queryBuilder = this.userRepository.createQueryBuilder('user')

    // Apply filters
    if (filters.search) {
      queryBuilder.andWhere('(LOWER(user.email) LIKE LOWER(:search) OR CAST(user.id AS TEXT) ILIKE :search)', {
        search: `%${filters.search}%`,
      })
    }

    if (filters.email) {
      queryBuilder.andWhere('LOWER(user.email) LIKE LOWER(:email)', {
        email: `%${filters.email}%`,
      })
    }

    if (filters.name) {
      queryBuilder.andWhere('LOWER(user.name) LIKE LOWER(:name)', {
        name: `%${filters.name}%`,
      })
    }

    if (filters.userId) {
      queryBuilder.andWhere('user.id = :userId', { userId: filters.userId })
    }

    if (filters.emailVerified !== undefined) {
      queryBuilder.andWhere('user.emailVerified = :emailVerified', {
        emailVerified: filters.emailVerified,
      })
    }

    if (filters.createdAfter) {
      queryBuilder.andWhere('user.createdAt >= :createdAfter', {
        createdAfter: new Date(filters.createdAfter),
      })
    }

    if (filters.createdBefore) {
      queryBuilder.andWhere('user.createdAt <= :createdBefore', {
        createdBefore: new Date(filters.createdBefore),
      })
    }

    // Apply sorting with validation
    const sortColumn = SORT_FIELD_MAP[sort.field || 'createdAt']
    if (!sortColumn) {
      throw new BadRequestException(`Invalid sort field: ${sort.field}`)
    }
    const sortOrder = sort.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    queryBuilder.orderBy(sortColumn, sortOrder, 'NULLS LAST')
    if (sortColumn !== 'user.createdAt') {
      queryBuilder.addOrderBy('user.createdAt', 'DESC')
    }

    // Apply pagination
    queryBuilder.skip(skip).take(pageSize)

    const [users, total] = await queryBuilder.getManyAndCount()

    // Map to response DTOs (excluding sensitive fields like keyPair, publicKeys)
    const userDtos: UserResponseDto[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    }))

    return {
      success: true,
      data: {
        users: userDtos,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }
}
