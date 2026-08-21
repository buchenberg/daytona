import { BadRequestException } from '@nestjs/common'
import { ListAuditLogsQueryDto, MAX_AUDIT_FILTER_RULES } from '../dto/list-audit-logs-query.dto'
import { AuditLogFilter } from '../interfaces/audit-filter.interface'

const FILTERABLE_FIELDS: ReadonlyArray<keyof ListAuditLogsQueryDto> = [
  'id',
  'actorId',
  'actorEmail',
  'actorApiKeyPrefix',
  'actorApiKeySuffix',
  'action',
  'targetType',
  'targetId',
  'statusCode',
  'createdAt',
]

function countActiveRules(query: ListAuditLogsQueryDto): number {
  let count = 0
  for (const field of FILTERABLE_FIELDS) {
    const filter = query[field]
    if (!filter || typeof filter !== 'object') continue
    for (const op of Object.keys(filter)) {
      const value = (filter as Record<string, unknown>)[op]
      if (value === undefined || value === null) continue
      if (Array.isArray(value) && value.length === 0) continue
      count++
    }
  }
  return count
}

export function buildAuditLogFilter(query: ListAuditLogsQueryDto): AuditLogFilter {
  const ruleCount = countActiveRules(query)
  if (ruleCount > MAX_AUDIT_FILTER_RULES) {
    throw new BadRequestException(
      `Too many filter rules: ${ruleCount}. Maximum ${MAX_AUDIT_FILTER_RULES} rules allowed per request.`,
    )
  }

  return {
    from: query.from,
    to: query.to,
    id: query.id,
    actorId: query.actorId,
    actorEmail: query.actorEmail,
    actorApiKeyPrefix: query.actorApiKeyPrefix,
    actorApiKeySuffix: query.actorApiKeySuffix,
    action: query.action,
    targetType: query.targetType,
    targetId: query.targetId,
    statusCode: query.statusCode,
    createdAt: query.createdAt,
  }
}
