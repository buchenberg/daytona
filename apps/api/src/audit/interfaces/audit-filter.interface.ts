import { StringFilter } from '../../common/dto/string-filter.dto'
import { IntFilter } from '../../common/dto/int-filter.dto'
import { DateFilter } from '../../common/dto/date-filter.dto'

export interface AuditLogFilter {
  /** @deprecated Prefer `createdAt.gte`. Retained for backward compatibility. */
  from?: Date
  /** @deprecated Prefer `createdAt.lte`. Retained for backward compatibility. */
  to?: Date

  id?: StringFilter
  actorId?: StringFilter
  actorEmail?: StringFilter
  actorApiKeyPrefix?: StringFilter
  actorApiKeySuffix?: StringFilter
  action?: StringFilter
  targetType?: StringFilter
  targetId?: StringFilter
  statusCode?: IntFilter
  createdAt?: DateFilter
}
