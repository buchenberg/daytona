export class CreateAuditLogInternalDto {
  actorId: string
  actorEmail: string
  action: string
  targetType?: string
  targetId?: string
  statusCode?: number
  errorMessage?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}
