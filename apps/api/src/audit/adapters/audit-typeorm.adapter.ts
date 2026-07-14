import { Logger } from '@nestjs/common'
import { AuditLogStorageAdapter } from '../interfaces/audit-storage.interface'
import { InjectRepository } from '@nestjs/typeorm'
import { AuditLog } from '../entities/audit-log.entity'
import {
  And,
  Equal,
  FindManyOptions,
  FindOperator,
  FindOptionsWhere,
  In,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm'
import { PaginatedList } from '../../common/interfaces/paginated-list.interface'
import { AuditLogFilter } from '../interfaces/audit-filter.interface'
import { StringFilter } from '../../common/dto/string-filter.dto'
import { IntFilter } from '../../common/dto/int-filter.dto'
import { DateFilter } from '../../common/dto/date-filter.dto'
import { AUDIT_LOG_SYSTEM_ACTOR_ID } from '../constants/audit-log-system-actor.constant'

export class AuditTypeormStorageAdapter implements AuditLogStorageAdapter {
  private readonly logger = new Logger(AuditTypeormStorageAdapter.name)

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async write(auditLogs: AuditLog[]): Promise<void> {
    throw new Error('Typeorm adapter does not support writing audit logs.')
  }

  async getAllLogs(page?: number, limit = 1000, filters?: AuditLogFilter): Promise<PaginatedList<AuditLog>> {
    const where = this.buildWhere(filters)
    const options: FindManyOptions<AuditLog> = {
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      where,
    }

    const [items, total] = await this.auditLogRepository.findAndCount(options)

    return {
      items,
      total,
      page: page,
      totalPages: Math.ceil(total / limit),
    }
  }

  async getOrganizationLogs(
    organizationId: string,
    page?: number,
    limit = 1000,
    filters?: AuditLogFilter,
  ): Promise<PaginatedList<AuditLog>> {
    const where = this.buildWhere(filters, { organizationId })
    const options: FindManyOptions<AuditLog> = {
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      where,
    }

    const [items, total] = await this.auditLogRepository.findAndCount(options)

    return {
      items,
      total,
      page: page,
      totalPages: Math.ceil(total / limit),
    }
  }

  private buildWhere(
    filters?: AuditLogFilter,
    base: Partial<FindOptionsWhere<AuditLog>> = {},
  ): FindOptionsWhere<AuditLog> {
    const actorIdOperators: FindOperator<string>[] = [
      Not(Equal(AUDIT_LOG_SYSTEM_ACTOR_ID)),
      ...this.stringOperatorsFor(filters?.actorId),
    ]
    const where: FindOptionsWhere<AuditLog> = {
      ...base,
      actorId: this.combineOperators<string>(actorIdOperators),
    }

    this.assignStringFilter(where, 'id', filters?.id)
    this.assignStringFilter(where, 'actorEmail', filters?.actorEmail)
    this.assignStringFilter(where, 'actorApiKeyPrefix', filters?.actorApiKeyPrefix)
    this.assignStringFilter(where, 'actorApiKeySuffix', filters?.actorApiKeySuffix)
    this.assignStringFilter(where, 'action', filters?.action)
    this.assignStringFilter(where, 'targetType', filters?.targetType)
    this.assignStringFilter(where, 'targetId', filters?.targetId)
    this.assignIntFilter(where, 'statusCode', filters?.statusCode)
    this.assignDateFilter(where, 'createdAt', filters)

    return where
  }

  private stringOperatorsFor(filter?: StringFilter): FindOperator<string>[] {
    if (!filter) return []
    const ops: FindOperator<string>[] = []
    if (filter.eq !== undefined) ops.push(Equal(filter.eq))
    if (filter.not !== undefined) ops.push(Not(Equal(filter.not)))
    if (filter.in && filter.in.length > 0) ops.push(In(filter.in))
    if (filter.notIn && filter.notIn.length > 0) ops.push(Not(In(filter.notIn)))
    return ops
  }

  private intOperatorsFor(filter?: IntFilter): FindOperator<number>[] {
    if (!filter) return []
    const ops: FindOperator<number>[] = []
    if (filter.eq !== undefined) ops.push(Equal(filter.eq))
    if (filter.not !== undefined) ops.push(Not(Equal(filter.not)))
    if (filter.in && filter.in.length > 0) ops.push(In(filter.in))
    if (filter.notIn && filter.notIn.length > 0) ops.push(Not(In(filter.notIn)))
    if (filter.gte !== undefined) ops.push(MoreThanOrEqual(filter.gte))
    if (filter.lte !== undefined) ops.push(LessThanOrEqual(filter.lte))
    if (filter.gt !== undefined) ops.push(MoreThan(filter.gt))
    if (filter.lt !== undefined) ops.push(LessThan(filter.lt))
    return ops
  }

  private dateOperatorsFor(createdAt?: DateFilter, from?: Date, to?: Date): FindOperator<Date>[] {
    const ops: FindOperator<Date>[] = []
    const gte = createdAt?.gte ?? from
    const lte = createdAt?.lte ?? to
    if (gte !== undefined) ops.push(MoreThanOrEqual(gte))
    if (lte !== undefined) ops.push(LessThanOrEqual(lte))
    if (createdAt?.gt !== undefined) ops.push(MoreThan(createdAt.gt))
    if (createdAt?.lt !== undefined) ops.push(LessThan(createdAt.lt))
    return ops
  }

  private combineOperators<T>(operators: FindOperator<T>[]): FindOperator<T> | undefined {
    if (operators.length === 0) return undefined
    if (operators.length === 1) return operators[0]
    return And(...operators)
  }

  private assignStringFilter(
    where: FindOptionsWhere<AuditLog>,
    field: keyof FindOptionsWhere<AuditLog>,
    filter?: StringFilter,
  ): void {
    const combined = this.combineOperators<string>(this.stringOperatorsFor(filter))
    if (combined) {
      ;(where as Record<string, unknown>)[field as string] = combined
    }
  }

  private assignIntFilter(
    where: FindOptionsWhere<AuditLog>,
    field: keyof FindOptionsWhere<AuditLog>,
    filter?: IntFilter,
  ): void {
    const combined = this.combineOperators<number>(this.intOperatorsFor(filter))
    if (combined) {
      ;(where as Record<string, unknown>)[field as string] = combined
    }
  }

  private assignDateFilter(
    where: FindOptionsWhere<AuditLog>,
    field: keyof FindOptionsWhere<AuditLog>,
    filters?: AuditLogFilter,
  ): void {
    const combined = this.combineOperators<Date>(this.dateOperatorsFor(filters?.createdAt, filters?.from, filters?.to))
    if (combined) {
      ;(where as Record<string, unknown>)[field as string] = combined
    }
  }
}
