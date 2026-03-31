/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { passportJwtSecret } from 'jwks-rsa'
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { BackofficeUserService } from '../services/backoffice-user.service'

export interface JwtPayload {
  sub: string
  email: string
  name: string
  role?: string
  iat: number
  exp: number
}

interface JwtStrategyConfig {
  jwksUri: string
  audience: string
  issuer: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name)
  private JWKS: ReturnType<typeof createRemoteJWKSet>

  constructor(
    private readonly options: JwtStrategyConfig,
    private readonly userService: BackofficeUserService,
    private readonly configService: ConfigService,
  ) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: options.jwksUri,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: options.audience,
      issuer: options.issuer,
      algorithms: ['RS256'],
      passReqToCallback: true,
    })
    this.JWKS = createRemoteJWKSet(new URL(options.jwksUri))
    this.logger.debug('JwtStrategy initialized with JWKS')
  }

  async validate(request: Request, payload: any) {
    // Handle different OIDC providers (Google, OKTA, etc.)
    let userId = payload.sub
    let email = payload.email

    // OKTA compatibility
    if (payload.cid && payload.uid) {
      userId = payload.uid
      email = payload.sub
    }

    // Find user - do NOT auto-create (whitelist enforcement)
    // Search by email first (Google sub is numeric, not UUID)
    let user = email ? await this.userService.findByEmail(email) : null

    // If not found by email, try by ID (for OIDC providers that use UUID as sub)
    if (!user && this.isValidUuid(userId)) {
      user = await this.userService.findOne(userId)
    }

    // WHITELIST ENFORCEMENT: Reject if user not in backoffice_user table
    if (!user) {
      this.logger.warn(`Authentication rejected for ${email} - not whitelisted`)
      throw new UnauthorizedException(
        `Access denied. Your email (${email}) is not whitelisted for backoffice access. Contact an administrator.`,
      )
    }

    // User found in whitelist
    {
      // Update last login
      await this.userService.updateLastLogin(user.id)

      // Update user name if changed (email is immutable - it's the whitelist key)
      const newName = payload.name || payload.username
      if (newName && (user.name === 'Unknown' || user.name !== newName)) {
        await this.userService.update(user.id, {
          name: newName,
        })
        this.logger.debug(`Updated backoffice user name: ${userId}`)
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'admin',
    }
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.JWKS, {
      audience: this.options.audience,
      issuer: this.options.issuer,
      algorithms: ['RS256'],
    })
    return payload
  }

  private isValidUuid(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(id)
  }
}
