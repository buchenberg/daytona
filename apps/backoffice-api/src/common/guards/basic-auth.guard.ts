/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface'
import { SUPER_ADMIN_PERMISSIONS } from '../permissions'

// Re-export for backward compatibility
export { AuthenticatedRequest }

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_001',
          message: 'Unauthorized - Invalid or missing credentials',
        },
      })
    }

    try {
      // Extract and decode base64 credentials
      const base64Credentials = authHeader.substring(6)
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      const [username, password] = credentials.split(':')

      // Get credentials from config
      const configUsername = this.configService.get<string>('basicAuth.username', 'admin')
      const configPassword = this.configService.get<string>('basicAuth.password', 'admin')

      // Validate credentials
      if (username === configUsername && password === configPassword) {
        // Set mock user for authenticated requests
        request.user = {
          id: 'admin-user-id',
          email: 'admin@daytona.io',
          permissions: SUPER_ADMIN_PERMISSIONS,
        }
        return true
      }

      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Unauthorized - Invalid credentials',
        },
      })
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }

      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_003',
          message: 'Unauthorized - Invalid authorization header format',
        },
      })
    }
  }
}
