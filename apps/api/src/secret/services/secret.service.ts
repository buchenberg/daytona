/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, In, Repository } from 'typeorm'
import { Secret } from '../entities/secret.entity'
import { CreateSecretDto } from '../dto/create-secret.dto'
import { UpdateSecretDto } from '../dto/update-secret.dto'
import { SecretSortDirection, SecretSortField } from '../dto/list-secrets-query.dto'
import { EncryptionService } from '../../encryption/encryption.service'
import { BadRequestError } from '../../exceptions/bad-request.exception'
import { Organization } from '../../organization/entities/organization.entity'

// Non-paginated listing is deprecated; above this many secrets it is refused
// entirely to protect the API from unbounded result sets.
const MAX_UNPAGINATED_SECRETS = 1500

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class SecretService {
  private readonly logger = new Logger(SecretService.name)

  constructor(
    @InjectRepository(Secret)
    private readonly secretRepository: Repository<Secret>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(createDto: CreateSecretDto, organization: Organization): Promise<Secret> {
    const existing = await this.secretRepository.findOne({
      where: { organizationId: organization.id, name: createDto.name },
    })

    if (existing) {
      throw new ConflictException(`Secret with name '${createDto.name}' already exists`)
    }

    const secretCount = await this.secretRepository.count({
      where: { organizationId: organization.id },
    })

    if (secretCount >= organization.secretQuota) {
      throw new BadRequestError(`Secret quota exceeded. Maximum allowed: ${organization.secretQuota}`)
    }

    const encryptedValue = await this.encryptionService.encrypt(createDto.value)

    const secret = this.secretRepository.create({
      name: createDto.name,
      encryptedValue,
      description: createDto.description,
      hosts: createDto.hosts ?? [],
      organizationId: organization.id,
    })

    try {
      return await this.secretRepository.save(secret)
    } catch (error) {
      // The findOne check above is best-effort; a concurrent create can still
      // race past it and hit the (organizationId, name) unique index. Surface a
      // 409 rather than a 500.
      if (error.code === '23505') {
        throw new ConflictException(`Secret with name '${createDto.name}' already exists`)
      }
      throw error
    }
  }

  async findAll(organizationId: string): Promise<Secret[]> {
    const count = await this.secretRepository.count({
      where: { organizationId },
    })

    if (count > MAX_UNPAGINATED_SECRETS) {
      throw new BadRequestError(
        `Organization has more than ${MAX_UNPAGINATED_SECRETS} secrets. Use the paginated list secrets endpoint (listSecretsPaginated) instead.`,
      )
    }

    return this.secretRepository.find({
      where: { organizationId },
      order: {
        createdAt: 'DESC',
      },
    })
  }

  async findAllPaginated(
    organizationId: string,
    cursor?: string,
    limit = 100,
    filters?: { name?: string },
    sort?: { field?: SecretSortField; direction?: SecretSortDirection },
  ): Promise<{ items: Secret[]; total: number; nextCursor: string | null }> {
    const sortField = sort?.field ?? SecretSortField.CREATED_AT
    const sortDirection = sort?.direction ?? SecretSortDirection.DESC
    const sqlDirection = sortDirection === SecretSortDirection.ASC ? 'ASC' : 'DESC'
    const sortColumn = `secret.${sortField}`

    const qb = this.secretRepository
      .createQueryBuilder('secret')
      .where('secret.organizationId = :organizationId', { organizationId })

    if (filters?.name) {
      qb.andWhere('secret.name ILIKE :name', { name: `%${filters.name}%` })
    }

    const total = await qb.clone().getCount()

    if (cursor) {
      const { sortValue, id } = this.decodeCursor(cursor, sortField, sortDirection)
      const op = sqlDirection === 'ASC' ? '>' : '<'

      qb.andWhere(
        new Brackets((cursorQb) => {
          cursorQb.where(`${sortColumn} ${op} :cursorSortValue`, { cursorSortValue: sortValue }).orWhere(
            new Brackets((tieBreaker) => {
              tieBreaker
                .where(`${sortColumn} = :cursorSortValue`, { cursorSortValue: sortValue })
                .andWhere(`secret.id ${op} :cursorId`, { cursorId: id })
            }),
          )
        }),
      )
    }

    // Sort with id as tie-breaker so the cursor predicate is a total order
    qb.orderBy(sortColumn, sqlDirection)
    qb.addOrderBy('secret.id', sqlDirection)

    // Fetch one extra to determine if there are more items
    qb.take(limit + 1)

    const rows = await qb.getMany()

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    let nextCursor: string | null = null
    if (hasMore && items.length > 0) {
      nextCursor = this.encodeCursor(items[items.length - 1], sortField, sortDirection)
    }

    return { items, total, nextCursor }
  }

  private encodeCursor(secret: Secret, sortField: SecretSortField, sortDirection: SecretSortDirection): string {
    const sortValue = secret[sortField]
    const cursorData = {
      sortValue: sortValue instanceof Date ? sortValue.toISOString() : sortValue,
      id: secret.id,
      sort: sortField,
      order: sortDirection,
    }
    return Buffer.from(JSON.stringify(cursorData)).toString('base64')
  }

  private decodeCursor(
    cursor: string,
    sortField: SecretSortField,
    sortDirection: SecretSortDirection,
  ): { sortValue: string; id: string } {
    let decoded: unknown
    try {
      decoded = JSON.parse(Buffer.from(cursor, 'base64').toString())
    } catch {
      throw new BadRequestError(`Invalid cursor provided: ${cursor}`)
    }

    // Validate the decoded shape so a malformed cursor fails as a 400 instead
    // of reaching the SQL layer
    const cursorData = decoded as { sortValue?: unknown; id?: unknown; sort?: unknown; order?: unknown }
    if (
      !cursorData ||
      typeof cursorData !== 'object' ||
      typeof cursorData.sortValue !== 'string' ||
      typeof cursorData.id !== 'string' ||
      !UUID_REGEX.test(cursorData.id)
    ) {
      throw new BadRequestError(`Invalid cursor provided: ${cursor}`)
    }

    // A cursor is only valid for the sort it was created with; continuing with
    // a different sort would skip or duplicate results
    if (cursorData.sort !== sortField || cursorData.order !== sortDirection) {
      throw new BadRequestError(
        'Cursor does not match the requested sort and order. Restart pagination without a cursor.',
      )
    }

    return { sortValue: cursorData.sortValue, id: cursorData.id }
  }

  async findOne(secretId: string, organizationId: string): Promise<Secret> {
    const secret = await this.secretRepository.findOne({
      where: { id: secretId, organizationId },
    })

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${secretId} not found`)
    }

    return secret
  }

  async update(secretId: string, updateDto: UpdateSecretDto, organizationId: string): Promise<Secret> {
    const secret = await this.secretRepository.findOne({
      where: { id: secretId, organizationId },
    })

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${secretId} not found`)
    }

    if (updateDto.value !== undefined) {
      secret.encryptedValue = await this.encryptionService.encrypt(updateDto.value)
    }

    if (updateDto.description !== undefined) {
      secret.description = updateDto.description || undefined
    }

    if (updateDto.hosts !== undefined) {
      secret.hosts = updateDto.hosts
    }

    return this.secretRepository.save(secret)
  }

  async findByNames(names: string[], organizationId: string): Promise<Secret[]> {
    if (names.length === 0) {
      return []
    }
    return this.secretRepository.find({
      where: { organizationId, name: In(names) },
    })
  }

  async resolveForSandbox(
    mounts: { secretId: string; envVar: string }[],
    organizationId: string,
  ): Promise<{ env: string; placeholder: string; value: string; hosts: string[] }[]> {
    if (mounts.length === 0) {
      return []
    }

    const secretIds = mounts.map((m) => m.secretId)
    const secrets = await this.secretRepository.find({
      where: { id: In(secretIds), organizationId },
    })

    const secretMap = new Map(secrets.map((s) => [s.id, s]))
    const resolved: { env: string; placeholder: string; value: string; hosts: string[] }[] = []

    for (const mount of mounts) {
      const secret = secretMap.get(mount.secretId)
      if (secret) {
        resolved.push({
          env: mount.envVar,
          placeholder: secret.placeholder,
          value: await this.encryptionService.decrypt(secret.encryptedValue),
          hosts: secret.hosts ?? [],
        })
      }
    }

    return resolved
  }

  async remove(secretId: string, organizationId: string): Promise<void> {
    const secret = await this.secretRepository.findOne({
      where: { id: secretId, organizationId },
    })

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${secretId} not found`)
    }

    await this.secretRepository.remove(secret)
  }
}
