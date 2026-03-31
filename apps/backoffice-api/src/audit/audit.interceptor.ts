/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request, Response } from 'express'
import { Observable, Subscriber, firstValueFrom } from 'rxjs'
import { AUDIT_CONTEXT_KEY, AuditContext } from './decorators/audit.decorator'
import { AuditLog } from '../backoffice-db/entities/audit-log.entity'
import { AuditService } from './audit.service'

type RequestWithUser = Request & {
  user?: {
    id: string
    email: string
    name?: string
    role?: string
  }
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithUser>()
    const response = context.switchToHttp().getResponse<Response>()

    const auditContext = this.reflector.get<AuditContext>(AUDIT_CONTEXT_KEY, context.getHandler())

    // Non-audited request
    if (!auditContext) {
      return next.handle()
    }

    if (!request.user) {
      this.logger.error('No user context found for audited request:', request.url)
      throw new UnauthorizedException()
    }

    return new Observable((observer) => {
      this.handleAuditedRequest(auditContext, request, response, next, observer)
    })
  }

  private async handleAuditedRequest(
    auditContext: AuditContext,
    request: RequestWithUser,
    response: Response,
    next: CallHandler,
    observer: Subscriber<any>,
  ): Promise<void> {
    try {
      // 1. Create audit log BEFORE request execution
      const auditLog = await this.auditService.createLog({
        actorId: request.user.id,
        actorEmail: request.user.email,
        action: auditContext.action,
        targetType: auditContext.targetType,
        targetId: this.resolveTargetId(auditContext, request),
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
        metadata: this.resolveRequestMetadata(auditContext, request),
      })

      try {
        // 2. Execute request handler
        const result = await firstValueFrom(next.handle())

        // 3. Update audit log with success
        const targetId = this.resolveTargetId(auditContext, request, result)
        const statusCode = response.statusCode || HttpStatus.OK
        await this.recordHandlerSuccess(auditLog, targetId, statusCode)

        observer.next(result)
        observer.complete()
      } catch (handlerError) {
        // 4. Update audit log with error
        const errorMessage = handlerError?.message || 'Unknown error'
        const statusCode = this.resolveErrorStatusCode(handlerError)
        await this.recordHandlerError(auditLog, errorMessage, statusCode)

        observer.error(handlerError)
      }
    } catch (createLogError) {
      this.logger.error('Failed to create audit log:', createLogError)
      observer.error(new InternalServerErrorException())
    }
  }

  private resolveTargetId(auditContext: AuditContext, request: RequestWithUser, result?: any): string | null {
    // Check for multiple IDs first (bulk operations)
    if (auditContext.targetIdsFromResult && result) {
      const targetIds = auditContext.targetIdsFromResult(result)
      if (targetIds && targetIds.length > 0) {
        return targetIds.join(',')
      }
    }

    if (auditContext.targetIdsFromRequest) {
      const targetIds = auditContext.targetIdsFromRequest(request)
      if (targetIds && targetIds.length > 0) {
        return targetIds.join(',')
      }
    }

    // Fall back to single ID
    if (auditContext.targetIdFromResult && result) {
      const targetId = auditContext.targetIdFromResult(result)
      if (targetId) {
        return targetId
      }
    }

    if (auditContext.targetIdFromRequest) {
      const targetId = auditContext.targetIdFromRequest(request)
      if (targetId) {
        return targetId
      }
    }

    return null
  }

  private resolveRequestMetadata(auditContext: AuditContext, request: RequestWithUser): Record<string, any> | null {
    if (!auditContext.requestMetadata) {
      return null
    }

    const resolvedMetadata: Record<string, any> = {}

    for (const [key, resolver] of Object.entries(auditContext.requestMetadata)) {
      try {
        resolvedMetadata[key] = resolver(request)
      } catch (error) {
        this.logger.warn(`Failed to resolve audit log metadata key "${key}":`, error)
        resolvedMetadata[key] = null
      }
    }

    return Object.keys(resolvedMetadata).length > 0 ? resolvedMetadata : null
  }

  private async recordHandlerSuccess(auditLog: AuditLog, targetId: string | null, statusCode: number): Promise<void> {
    try {
      await this.auditService.updateLog(auditLog.id, {
        targetId,
        statusCode,
      })
    } catch (error) {
      this.logger.error('Failed to record handler result:', error)
    }
  }

  private async recordHandlerError(auditLog: AuditLog, errorMessage: string, statusCode: number): Promise<void> {
    try {
      await this.auditService.updateLog(auditLog.id, {
        errorMessage,
        statusCode,
      })
    } catch (error) {
      this.logger.error('Failed to record handler error:', error)
    }
  }

  private resolveErrorStatusCode(error: any): number {
    if (error instanceof HttpException) {
      return error.getStatus()
    }

    return HttpStatus.INTERNAL_SERVER_ERROR
  }
}
