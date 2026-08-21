import { AuditLog } from '../entities/audit-log.entity'

export class AuditLogCreatedEvent {
  constructor(public readonly auditLog: AuditLog) {}
}
