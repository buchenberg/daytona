/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { timingSafeEqual } from 'crypto'
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface'

// Re-export for backward compatibility
export { AuthenticatedRequest }

@Injectable()
export class FlexibleAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authMode = this.configService.get<string>('auth.mode', 'both')

    // Try cookie-based session first
    const sessionCookie = request.cookies?.backoffice_session
    if (sessionCookie) {
      if (authMode === 'basic') {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'AUTH_002',
            message: 'Session authentication not enabled',
          },
        })
      }
      return this.validateSessionCookie(request, sessionCookie)
    }

    // Try Basic Auth fallback
    const authHeader = request.headers.authorization
    if (authHeader?.startsWith('Basic ')) {
      if (authMode === 'oidc') {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'AUTH_003',
            message: 'Basic authentication not enabled',
          },
        })
      }
      return this.validateBasicAuth(request, authHeader)
    }

    throw new UnauthorizedException({
      success: false,
      error: {
        code: 'AUTH_001',
        message: 'No authentication credentials provided',
      },
    })
  }

  private async validateSessionCookie(request: any, cookie: string): Promise<boolean> {
    try {
      // Trust the JWT - DB validation happens only on /auth/refresh
      const payload = await this.jwtService.verifyAsync(cookie)

      request.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
      }
      return true
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_005',
          message: 'Invalid or expired session',
        },
      })
    }
  }

  private validateBasicAuth(request: any, authHeader: string): boolean {
    try {
      const base64Credentials = authHeader.substring(6)
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      const [username, password] = credentials.split(':')

      const configUsername = this.configService.get<string>('basicAuth.username')
      const configPassword = this.configService.get<string>('basicAuth.password')

      // SECURITY FIX #4: Use constant-time comparison to prevent timing attacks
      let usernameMatch = false
      let passwordMatch = false

      try {
        usernameMatch = timingSafeEqual(Buffer.from(username), Buffer.from(configUsername))
      } catch {
        usernameMatch = false
      }

      try {
        passwordMatch = timingSafeEqual(Buffer.from(password), Buffer.from(configPassword))
      } catch {
        passwordMatch = false
      }

      if (usernameMatch && passwordMatch) {
        request.user = {
          id: 'admin-user-id',
          email: 'admin@daytona.io',
          name: 'Admin (BasicAuth)',
          role: 'admin',
        }
        return true
      }

      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_006',
          message: 'Invalid Basic Auth credentials',
        },
      })
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }

      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_007',
          message: 'Invalid Basic Auth header format',
        },
      })
    }
  }
}
