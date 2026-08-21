import { AuditLog } from '../entities/audit-log.entity'

export class AuditLogUpdatedEvent {
  constructor(public readonly auditLog: AuditLog) {}
}
